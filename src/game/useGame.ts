/**
 * Состояние партии — машина состояний игры на реактивных ref'ах.
 *
 * Слой НЕ знает про Three.js и DOM: анимацией хода и подсветкой подсказки
 * управляет через интерфейс MoveAnimator, который прикручивает компонент
 * доски (TheBoard.vue). Правила целиком берутся из чистого ядра (core).
 */
import { computed, ref } from 'vue';
import {
  BOT, HUMAN, LEVELS, MAX_PLIES,
  applyMove, countIn, createGame, genMoves, idx, isWin, judgeByLimit, other, unapplyMove,
  type Board, type LevelId, type Move, type Point, type Side,
} from '@/core';
import { useEngine } from '@/engine/useEngine';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import { sfx } from '@/composables/useSound';

/** То, что сценарий партии требует от визуального слоя. */
export interface MoveAnimator {
  animateMove(mv: Move, side: Side): Promise<void>;
  showHint(mv: Move): void;
  hideHint(): void;
}

interface HistoryItem {
  mv: Move;
  side: Side;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function createGameSession() {
  const engine = useEngine();
  const settings = useSettingsStore();
  const toast = useToast();

  /* ---------- состояние ---------- */
  const board = ref<Board>(createGame());
  const turn = ref<Side>(HUMAN);
  const firstMove = ref<Side>(HUMAN);
  const selected = ref<Point | null>(null);
  const history = ref<HistoryItem[]>([]);
  const plies = ref(0);
  const over = ref(false);
  const busy = ref(false);
  const winner = ref<Side | null>(null);
  const reason = ref('');

  let animator: MoveAnimator | null = null;
  /**
   * «Эпоха» сессии: newGame/undo её увеличивают. Долгие операции
   * (анимация, поиск ИИ) сравнивают свою эпоху перед коммитом и
   * тихо отменяются, если партия уже перезапущена.
   */
  let epoch = 0;

  /* ---------- производные данные ---------- */
  /** Все ходы выбранной шашки, дедуп по клетке приземления (кратчайшая цепочка). */
  const movesByCell = computed(() => {
    const map = new Map<number, Move>();
    const s = selected.value;
    if (!s) return map;
    for (const m of genMoves(board.value, HUMAN)) {
      if (m.from.r !== s.r || m.from.c !== s.c) continue;
      const k = idx(m.to.r, m.to.c);
      const prev = map.get(k);
      if (!prev || m.path.length < prev.path.length) map.set(k, m);
    }
    return map;
  });

  const progressYou = computed(() => countIn(board.value, HUMAN));
  const progressBot = computed(() => countIn(board.value, BOT));
  const historyLength = computed(() => history.value.length);
  const level = computed(() => settings.level);

  /* ---------- действия ---------- */
  function attachAnimator(a: MoveAnimator | null): void {
    animator = a;
  }

  /**
   * Клик по клетке (номер клетки возвращает сцена через pickCell) или null.
   * Повторный клик по выбранной шашке — снять выбор.
   */
  function tapCell(cell: number | null): void {
    if (busy.value || over.value) return;
    if (cell === null) {
      selected.value = null;
      animator?.hideHint();
      return;
    }
    const mv = movesByCell.value.get(cell);
    if (mv) {
      void playMove(mv, HUMAN);
      return;
    }
    const p = board.value[cell];
    const r = (cell / 9) | 0;
    const c = cell % 9;
    if (p === HUMAN) {
      if (selected.value && selected.value.r === r && selected.value.c === c) {
        selected.value = null;
        return;
      }
      selected.value = { r, c };
      sfx.select();
      if (!movesByCell.value.size) toast.show('Отсюда нет ходов');
    } else if (p === BOT) {
      toast.show('Это шашка соперника');
    } else {
      selected.value = null;
      animator?.hideHint();
    }
  }

  /**
   * Ход: модель меняется ПОСЛЕ анимации (коммит снапшота), иначе watcher
   * сцены телепортировал бы шашку в конец маршрута раньше времени.
   */
  async function playMove(mv: Move, side: Side): Promise<void> {
    busy.value = true;
    selected.value = null;
    animator?.hideHint();
    toast.hide();

    const next = board.value.slice();
    applyMove(next, mv, side);
    history.value.push({ mv, side });
    plies.value++;

    const myEpoch = epoch;
    if (animator) await animator.animateMove(mv, side);
    if (myEpoch !== epoch) return; // партия перезапущена во время анимации
    sfx.land();

    board.value = next;

    if (isWin(next, side)) return endGame(side);
    turn.value = other(side);
    if (plies.value >= MAX_PLIES) return endGame(judgeByLimit(next));

    if (!genMoves(next, turn.value).length) {
      const alt = other(turn.value);
      if (genMoves(next, alt).length) {
        toast.show(turn.value === HUMAN ? 'Нет ходов — пропускаю' : 'ИИ без ходов — пропуск');
        turn.value = alt;
        if (turn.value === BOT) return void botTurn();
        busy.value = false;
        return;
      }
      return endGame(null, 'Пат');
    }

    if (turn.value === BOT) return void botTurn();
    busy.value = false;
  }

  async function botTurn(): Promise<void> {
    if (over.value) return;
    busy.value = true;
    const cfg = LEVELS[settings.level];
    const myEpoch = epoch;
    const t0 = performance.now();
    const res = await engine.search(board.value.slice(), BOT, cfg);
    if (over.value || myEpoch !== epoch || !res.move) {
      if (myEpoch === epoch) busy.value = false;
      return;
    }
    await delay(Math.max(0, 340 - (performance.now() - t0)));
    if (!over.value && myEpoch === epoch) await playMove(res.move, BOT);
  }

  /** Отмена: откатываем полуходы до хода человека включительно. */
  function undo(): void {
    if (busy.value) {
      toast.show('Дождись конца хода');
      return;
    }
    if (!history.value.length) return;
    const next = board.value.slice();
    let backToHuman = false;
    while (history.value.length) {
      const h = history.value.pop()!;
      unapplyMove(next, h.mv, h.side);
      plies.value--;
      if (h.side === HUMAN) {
        backToHuman = true;
        break;
      }
    }
    board.value = next;
    over.value = false;
    busy.value = false;
    selected.value = null;
    winner.value = null;
    reason.value = '';
    epoch++;
    toast.show('Ход отменён');
    if (backToHuman || firstMove.value === HUMAN) {
      turn.value = HUMAN;
    } else {
      turn.value = BOT;
      setTimeout(() => void botTurn(), 300);
    }
  }

  /** Подсказка: тот же движок, сторона человека, средний уровень. */
  async function hint(): Promise<void> {
    if (busy.value || over.value) return;
    const myEpoch = epoch;
    const res = await engine.search(board.value.slice(), HUMAN, { depth: 5, ms: 500, jitter: 1 });
    if (over.value || myEpoch !== epoch || !res.move) return;
    animator?.showHint(res.move);
    toast.show('Подсказка: ' + (res.move.jumps ? 'цепочка прыжков' : 'тихий ход') + ' в отмеченный угол');
  }

  function endGame(win: Side | null, why = ''): void {
    over.value = true;
    busy.value = false;
    selected.value = null;
    winner.value = win;
    reason.value = why;
    if (win === HUMAN) sfx.win();
    else if (win === BOT) sfx.lose();
    else sfx.draw();
    firstMove.value = other(firstMove.value); // в новой партии первым ходит другой
  }

  function newGame(): void {
    epoch++;
    board.value = createGame();
    history.value = [];
    plies.value = 0;
    over.value = false;
    busy.value = false;
    selected.value = null;
    winner.value = null;
    reason.value = '';
    turn.value = firstMove.value;
    animator?.hideHint();
    toast.hide();
    if (turn.value === BOT) {
      busy.value = true;
      setTimeout(() => void botTurn(), 620);
    }
  }

  /** Смена сложности, как в оригинале, сразу начинает новую партию. */
  function setLevel(level: LevelId): void {
    settings.setLevel(level);
    newGame();
    toast.show('Сложность: ' + LEVELS[level].label + ' · новая партия', 2400);
  }

  return {
    // состояние
    board, turn, firstMove, selected, plies, over, busy, winner, reason,
    movesByCell, progressYou, progressBot, historyLength, level,
    // действия
    attachAnimator, tapCell, playMove, undo, hint, newGame, setLevel,
  };
}

export type GameApi = ReturnType<typeof createGameSession>;

let instance: GameApi | null = null;

/** Singleton партии на всё приложение. */
export function useGame(): GameApi {
  if (!instance) instance = createGameSession();
  return instance;
}
