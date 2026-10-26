/**
 * Состояние партии — машина состояний игры на реактивных ref'ах.
 *
 * Поддерживает:
 * 1. Одиночный режим против ИИ (WebWorker alpha-beta движок) с сохранением партии при перезагрузке.
 * 2. Онлайн-мультиплеер через GameHub Realtime (SignalR BaaS):
 *    - быстрый поиск (`quickMatch`), создание комнат и вход по коду (`joinRoom`);
 *    - учёт роли хоста (`room.isHost`, `room.on('host_changed', ...)`);
 *    - серверная синхронизация состояния (`room.syncState('game_state', ...)`, `room.on('state:game_state', ...)`);
 *    - мгновенные события хода (`room.broadcast('player_action', ...)`, `room.on('player_action', ...)`);
 *    - полное бесшовное восстановление партии и места игрока при обновлении страницы (F5).
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
import {
  getStableClientId,
  loadActiveRoomCode,
  loadCachedRoomState,
  saveActiveRoomCode,
  saveCachedRoomState,
  usePlatform,
  type GameHubRoom,
  type PlayerActionPayload,
  type RoomSeat,
  type SyncedRoomGameState,
} from '@/platform/gamehub';

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

interface SinglePlayerSnapshot {
  board: Board;
  turn: Side;
  firstMove: Side;
  plies: number;
  history: HistoryItem[];
  over: boolean;
  winner: Side | null;
  reason: string;
}

const AI_SNAPSHOT_KEY = 'ugolki.vue.ai_snapshot';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function saveAiSnapshot(snap: SinglePlayerSnapshot): void {
  try {
    localStorage.setItem(AI_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

function loadAiSnapshot(): SinglePlayerSnapshot | null {
  try {
    const raw = localStorage.getItem(AI_SNAPSHOT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SinglePlayerSnapshot;
    if (p && Array.isArray(p.board) && p.board.length === 81 && p.plies > 0 && !p.over) {
      return p;
    }
    return null;
  } catch {
    return null;
  }
}

function unwrapRoomState(raw: any): SyncedRoomGameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate =
    Array.isArray(raw.board)
      ? raw
      : raw.state && typeof raw.state === 'object' && Array.isArray(raw.state.board)
        ? raw.state
        : raw.value && typeof raw.value === 'object' && Array.isArray(raw.value.board)
          ? raw.value
          : null;
  if (!candidate || candidate.board.length !== 81) return null;
  return candidate as SyncedRoomGameState;
}

function createGameSession() {
  const engine = useEngine();
  const settings = useSettingsStore();
  const toast = useToast();
  const platform = usePlatform();

  /* ---------- состояние ---------- */
  const mode = ref<'ai' | 'online'>('ai');
  const board = ref<Board>(createGame());
  const turn = ref<Side>(HUMAN);
  const firstMove = ref<Side>(HUMAN);
  const mySide = ref<Side>(HUMAN);
  const selected = ref<Point | null>(null);
  const history = ref<HistoryItem[]>([]);
  const plies = ref(0);
  const over = ref(false);
  const busy = ref(false);
  const winner = ref<Side | null>(null);
  const reason = ref('');

  /* ---------- мультиплеер и награды ---------- */
  const roomCode = ref<string | null>(null);
  const isHost = ref(false);
  const roomStatus = ref<'idle' | 'connecting' | 'waiting' | 'playing' | 'finished'>('idle');
  const seat1 = ref<RoomSeat | null>(null);
  const seat2 = ref<RoomSeat | null>(null);
  const lastEarnedCoins = ref(0);
  const lastMatchScore = ref(0);

  let activeRoom: GameHubRoom | null = null;
  let stateVersion = 0;
  const processedMoveIds = new Set<string>();
  let initSyncTimer: number | undefined;

  let animator: MoveAnimator | null = null;
  let epoch = 0;

  /* ---------- производные данные ---------- */
  const oppSide = computed<Side>(() => other(mySide.value));

  const movesByCell = computed(() => {
    const map = new Map<number, Move>();
    const s = selected.value;
    if (!s) return map;
    if (mode.value === 'online') {
      if (roomStatus.value !== 'playing' || turn.value !== mySide.value) return map;
    }
    const activeSide = mode.value === 'online' ? mySide.value : HUMAN;
    for (const m of genMoves(board.value, activeSide)) {
      if (m.from.r !== s.r || m.from.c !== s.c) continue;
      const k = idx(m.to.r, m.to.c);
      const prev = map.get(k);
      if (!prev || m.path.length < prev.path.length) map.set(k, m);
    }
    return map;
  });

  const progressYou = computed(() => countIn(board.value, mySide.value));
  const progressBot = computed(() => countIn(board.value, oppSide.value));
  const historyLength = computed(() => history.value.length);
  const level = computed(() => settings.level);

  const opponentName = computed(() => {
    if (mode.value !== 'online') return 'ИИ (' + LEVELS[settings.level].label + ')';
    const oppSeat = mySide.value === HUMAN ? seat2.value : seat1.value;
    return oppSeat ? oppSeat.displayName : 'Ожидание соперника…';
  });

  const isMyTurn = computed(() => {
    if (over.value) return false;
    if (mode.value === 'online') {
      return roomStatus.value === 'playing' && turn.value === mySide.value;
    }
    return turn.value === HUMAN;
  });

  /* ---------- вспомогательные методы мультиплеера ---------- */
  function getMySeatIdentity(): RoomSeat {
    return {
      playerId: platform.user.value.playerId,
      clientId: getStableClientId(),
      displayName: platform.user.value.displayName || 'Игрок',
    };
  }

  function isMySeat(seat: RoomSeat | null | undefined): boolean {
    if (!seat) return false;
    const me = getMySeatIdentity();
    return seat.clientId === me.clientId || seat.playerId === me.playerId;
  }

  function buildCurrentRoomState(
    statusOverride?: 'waiting' | 'playing' | 'finished',
    lastMove: Move | null = null,
  ): SyncedRoomGameState {
    stateVersion++;
    const bothSeated = Boolean(seat1.value && seat2.value);
    const status =
      statusOverride ?? (over.value ? 'finished' : bothSeated ? 'playing' : 'waiting');
    return {
      roomCode: roomCode.value || 'main_room',
      status,
      board: board.value.slice(),
      turn: turn.value,
      firstMove: firstMove.value,
      plies: plies.value,
      lastMove,
      winner: winner.value,
      reason: reason.value,
      seat1: seat1.value,
      seat2: seat2.value,
      updatedAt: Date.now(),
      version: stateVersion,
    };
  }

  async function pushRoomState(state: SyncedRoomGameState): Promise<void> {
    if (roomCode.value) {
      saveCachedRoomState(roomCode.value, state);
    }
    if (!activeRoom) return;
    try {
      await activeRoom.syncState('game_state', state);
    } catch {
      /* ignore network hiccup */
    }
  }

  function applySyncedStateToLocal(st: SyncedRoomGameState): void {
    stateVersion = Math.max(stateVersion, st.version || 0);
    seat1.value = st.seat1 ?? null;
    seat2.value = st.seat2 ?? null;

    if (isMySeat(st.seat1)) {
      mySide.value = HUMAN;
    } else if (isMySeat(st.seat2)) {
      mySide.value = BOT;
    }

    board.value = st.board.slice();
    turn.value = st.turn;
    firstMove.value = st.firstMove ?? HUMAN;
    plies.value = st.plies ?? 0;
    winner.value = st.winner ?? null;
    reason.value = st.reason ?? '';
    over.value = st.status === 'finished' || st.winner !== null;
    roomStatus.value = over.value ? 'finished' : st.seat1 && st.seat2 ? 'playing' : 'waiting';
    busy.value = false;

    if (roomCode.value) {
      saveCachedRoomState(roomCode.value, st);
    }
  }

  async function handleIncomingRoomState(raw: unknown): Promise<void> {
    if (mode.value !== 'online') return;
    const st = unwrapRoomState(raw);
    if (!st) return;

    if (initSyncTimer !== undefined) {
      clearTimeout(initSyncTimer);
      initSyncTimer = undefined;
    }

    const me = getMySeatIdentity();
    let needsResync = false;

    // Проверяем, сидим ли мы уже на месте 1 или 2 (включая сценарий после F5!)
    if (isMySeat(st.seat1)) {
      mySide.value = HUMAN;
      if (st.seat1!.playerId !== me.playerId || st.seat1!.displayName !== me.displayName) {
        st.seat1 = me;
        needsResync = true;
      }
    } else if (isMySeat(st.seat2)) {
      mySide.value = BOT;
      if (st.seat2!.playerId !== me.playerId || st.seat2!.displayName !== me.displayName) {
        st.seat2 = me;
        needsResync = true;
      }
    } else if (!st.seat1) {
      st.seat1 = me;
      mySide.value = HUMAN;
      needsResync = true;
    } else if (!st.seat2) {
      st.seat2 = me;
      mySide.value = BOT;
      if (st.status === 'waiting') st.status = 'playing';
      needsResync = true;
      toast.show(`Подключено к матчу против ${st.seat1.displayName}!`, 3000);
    }

    if (st.seat1 && st.seat2 && st.status === 'waiting' && !st.winner) {
      st.status = 'playing';
      needsResync = true;
    }

    applySyncedStateToLocal(st);

    if (needsResync) {
      st.version = ++stateVersion;
      st.updatedAt = Date.now();
      await pushRoomState(st);
      try {
        await activeRoom?.broadcast('player_action', {
          type: 'sync_snapshot',
          state: st,
        } satisfies PlayerActionPayload);
      } catch {
        /* ignore */
      }
    }
  }

  async function handleIncomingPlayerAction(rawEvt: any): Promise<void> {
    if (mode.value !== 'online' || !activeRoom) return;
    const payload = (
      rawEvt && typeof rawEvt === 'object' && 'payload' in rawEvt ? rawEvt.payload : rawEvt
    ) as PlayerActionPayload | undefined;
    if (!payload || typeof payload !== 'object' || !('type' in payload)) return;

    const me = getMySeatIdentity();

    if (payload.type === 'hello') {
      if (payload.clientId === me.clientId || payload.playerId === me.playerId) return;
      const peerSeat: RoomSeat = {
        playerId: payload.playerId,
        clientId: payload.clientId,
        displayName: payload.displayName || 'Соперник',
      };

      let seatChanged = false;
      if (seat1.value && (seat1.value.clientId === peerSeat.clientId || seat1.value.playerId === peerSeat.playerId)) {
        seat1.value = peerSeat;
        seatChanged = true;
      } else if (seat2.value && (seat2.value.clientId === peerSeat.clientId || seat2.value.playerId === peerSeat.playerId)) {
        seat2.value = peerSeat;
        seatChanged = true;
      } else if (!seat1.value) {
        seat1.value = peerSeat;
        seatChanged = true;
      } else if (!seat2.value) {
        seat2.value = peerSeat;
        seatChanged = true;
        toast.show(`${peerSeat.displayName} вошёл в комнату! Партия началась`, 3200);
      }

      if (seat1.value && seat2.value && roomStatus.value === 'waiting' && !over.value) {
        roomStatus.value = 'playing';
      }

      // Отправляем актуальный слепок состояния вошедшему/обновившему страницу игроку
      if (seatChanged || isHost.value || seat1.value) {
        const snap = buildCurrentRoomState();
        await pushRoomState(snap);
        try {
          await activeRoom.broadcast('player_action', {
            type: 'sync_snapshot',
            state: snap,
          } satisfies PlayerActionPayload);
        } catch {
          /* ignore */
        }
      }
    } else if (payload.type === 'sync_snapshot') {
      if (payload.state && payload.state.version >= stateVersion) {
        await handleIncomingRoomState(payload.state);
      }
    } else if (payload.type === 'move') {
      if (processedMoveIds.has(payload.moveId)) return;
      processedMoveIds.add(payload.moveId);

      // Если это ход соперника — красиво анимируем его на 3D-доске
      if (payload.side !== mySide.value) {
        busy.value = true;
        selected.value = null;
        animator?.hideHint();
        const myEpoch = epoch;
        if (animator) {
          await animator.animateMove(payload.mv, payload.side);
        }
        if (myEpoch !== epoch) return;
        sfx.land();
      }

      const wasOver = over.value;
      applySyncedStateToLocal(payload.state);

      if (!wasOver && over.value) {
        void finalizeMatchRewards(winner.value, reason.value);
      }
    } else if (payload.type === 'new_game') {
      epoch++;
      selected.value = null;
      animator?.hideHint();
      applySyncedStateToLocal(payload.state);
      toast.show('Соперник начал новую партию в комнате', 2600);
    } else if (payload.type === 'leave') {
      if (seat2.value && (seat2.value.clientId === payload.clientId || seat2.value.playerId === payload.playerId)) {
        seat2.value = null;
        if (!over.value) roomStatus.value = 'waiting';
        toast.show('Соперник покинул комнату', 2800);
      } else if (seat1.value && (seat1.value.clientId === payload.clientId || seat1.value.playerId === payload.playerId)) {
        // Если первый игрок вышел, занимаем место 1
        seat1.value = getMySeatIdentity();
        seat2.value = null;
        mySide.value = HUMAN;
        if (!over.value) roomStatus.value = 'waiting';
        toast.show('Хост вышел — теперь вы ведущий комнаты', 2800);
      }
      if (isHost.value) {
        await pushRoomState(buildCurrentRoomState());
      }
    }
  }

  async function bindRoom(
    room: GameHubRoom,
    requestedCode: string,
    options: { isReconnect?: boolean; forceFreshCreate?: boolean } = {},
  ): Promise<void> {
    if (activeRoom && activeRoom !== room) {
      try {
        await activeRoom.leave?.();
        await activeRoom.disconnect?.();
      } catch {
        /* ignore */
      }
    }

    epoch++;
    activeRoom = room;
    mode.value = 'online';
    const resolvedCode = String(room.code || room.roomId || room.id || room.name || requestedCode || 'main_room');
    roomCode.value = resolvedCode;
    isHost.value = Boolean(room.isHost);
    roomStatus.value = 'connecting';

    saveActiveRoomCode(resolvedCode);
    void platform.patchSave({ activeRoomCode: resolvedCode });

    const me = getMySeatIdentity();

    // Если это реконнект (например, после F5) и у нас есть локальный кэш комнаты — мгновенно отрисуем его
    const cached = !options.forceFreshCreate ? loadCachedRoomState(resolvedCode) : null;
    if (cached && (isMySeat(cached.seat1) || isMySeat(cached.seat2))) {
      applySyncedStateToLocal(cached);
    }

    // Подписка на смену хоста по требованию платформы GameHub
    room.on('host_changed', ({ isHost: nextIsHost }) => {
      isHost.value = Boolean(nextIsHost);
      if (isHost.value && mode.value === 'online') {
        void pushRoomState(buildCurrentRoomState());
      }
    });

    // Подписка на серверное состояние комнаты
    room.on('state:game_state', (st) => {
      void handleIncomingRoomState(st);
    });

    // Подписка на быстрые события реального времени
    room.on('player_action', (evt) => {
      void handleIncomingPlayerAction(evt);
    });

    // Проверяем, отдал ли объект комнаты начальное состояние сразу
    if (room.state && room.state.game_state && !options.forceFreshCreate) {
      await handleIncomingRoomState(room.state.game_state);
    }

    // Отправляем приветствие пирам в комнате (для синхронизации при входе или после F5)
    try {
      await room.broadcast('player_action', {
        type: 'hello',
        playerId: me.playerId,
        clientId: me.clientId,
        displayName: me.displayName,
      } satisfies PlayerActionPayload);
    } catch {
      /* ignore */
    }

    // Если за 220 мс состояние от сервера/пира не пришло — инициализируем или восстанавливаем комнату сами
    if (initSyncTimer !== undefined) clearTimeout(initSyncTimer);
    initSyncTimer = window.setTimeout(() => {
      if (mode.value !== 'online' || activeRoom !== room) return;
      if (roomStatus.value !== 'connecting') return;

      if (cached && !options.forceFreshCreate) {
        if (!cached.seat1) cached.seat1 = me;
        applySyncedStateToLocal(cached);
        void pushRoomState(cached);
        return;
      }

      // Создаём чистую партию в новой комнате
      board.value = createGame();
      turn.value = HUMAN;
      firstMove.value = HUMAN;
      mySide.value = HUMAN;
      plies.value = 0;
      over.value = false;
      busy.value = false;
      winner.value = null;
      reason.value = '';
      seat1.value = me;
      seat2.value = null;
      roomStatus.value = 'waiting';
      const initial = buildCurrentRoomState('waiting', null);
      void pushRoomState(initial);
    }, 220);
  }

  /* ---------- публичные методы мультиплеера ---------- */
  async function startQuickMatch(): Promise<void> {
    roomStatus.value = 'connecting';
    toast.show('Поиск соперника в GameHub…', 2000);
    const room = await platform.hub.realtime.quickMatch({ maxPlayers: 2 });
    await bindRoom(room, 'main_room');
  }

  async function createOnlineRoom(customCode?: string): Promise<string> {
    const clean =
      customCode && customCode.trim()
        ? customCode.trim().toUpperCase()
        : 'UGOL-' + Math.floor(1000 + Math.random() * 9000);
    roomStatus.value = 'connecting';
    const room = await platform.hub.realtime.joinRoom(clean);
    await bindRoom(room, clean, { forceFreshCreate: true });
    toast.show(`Комната ${clean} создана! Пригласите соперника`, 3400);
    return clean;
  }

  async function joinOnlineRoom(code: string, isReconnect = false): Promise<void> {
    const clean = code.trim() || 'main_room';
    roomStatus.value = 'connecting';
    const room = await platform.hub.realtime.joinRoom(clean);
    await bindRoom(room, clean, { isReconnect });
    if (!isReconnect) {
      toast.show(`Вход в комнату ${clean}…`, 2200);
    } else {
      toast.show(`Восстановлено подключение к комнате ${clean}`, 2600);
    }
  }

  async function leaveOnlineRoom(): Promise<void> {
    if (initSyncTimer !== undefined) {
      clearTimeout(initSyncTimer);
      initSyncTimer = undefined;
    }
    if (activeRoom) {
      try {
        const me = getMySeatIdentity();
        await activeRoom.broadcast('player_action', {
          type: 'leave',
          playerId: me.playerId,
          clientId: me.clientId,
        } satisfies PlayerActionPayload);
        await activeRoom.leave?.();
        await activeRoom.disconnect?.();
      } catch {
        /* ignore */
      }
      activeRoom = null;
    }
    saveActiveRoomCode(null);
    void platform.patchSave({ activeRoomCode: null });

    mode.value = 'ai';
    roomCode.value = null;
    isHost.value = false;
    roomStatus.value = 'idle';
    seat1.value = null;
    seat2.value = null;
    mySide.value = HUMAN;
    newGame();
    toast.show('Вы вернулись в режим игры против ИИ', 2400);
  }

  /* ---------- действия игровой доски ---------- */
  function attachAnimator(a: MoveAnimator | null): void {
    animator = a;
  }

  function tapCell(cell: number | null): void {
    if (busy.value || over.value) return;
    if (mode.value === 'online') {
      if (roomStatus.value === 'waiting' || !seat2.value) {
        toast.show('Дождитесь подключения второго игрока в комнату');
        return;
      }
      if (turn.value !== mySide.value) {
        toast.show('Сейчас ход соперника');
        return;
      }
    }

    if (cell === null) {
      selected.value = null;
      animator?.hideHint();
      return;
    }

    const mv = movesByCell.value.get(cell);
    const activeSide = mode.value === 'online' ? mySide.value : HUMAN;
    if (mv) {
      void playMove(mv, activeSide);
      return;
    }

    const p = board.value[cell];
    const r = (cell / 9) | 0;
    const c = cell % 9;
    if (p === activeSide) {
      if (selected.value && selected.value.r === r && selected.value.c === c) {
        selected.value = null;
        return;
      }
      selected.value = { r, c };
      sfx.select();
      if (!movesByCell.value.size) toast.show('Отсюда нет ходов');
    } else if (p === other(activeSide)) {
      toast.show('Это шашка соперника');
    } else {
      selected.value = null;
      animator?.hideHint();
    }
  }

  async function finalizeMatchRewards(win: Side | null, why = ''): Promise<void> {
    over.value = true;
    busy.value = false;
    selected.value = null;
    winner.value = win;
    reason.value = why;

    const didWin = win === mySide.value;
    const isDraw = win === null;

    if (didWin) sfx.win();
    else if (win !== null) sfx.lose();
    else sfx.draw();

    firstMove.value = other(firstMove.value);

    const { earnedCoins, matchScore } = await platform.recordMatchResult({
      won: didWin,
      draw: isDraw,
      plies: plies.value,
      levelId: settings.level,
      isOnline: mode.value === 'online',
    });
    lastEarnedCoins.value = earnedCoins;
    lastMatchScore.value = matchScore;
  }

  async function playMove(mv: Move, side: Side): Promise<void> {
    busy.value = true;
    selected.value = null;
    animator?.hideHint();
    toast.hide();

    const next = board.value.slice();
    applyMove(next, mv, side);
    history.value.push({ mv, side });
    plies.value++;

    // Вычисляем следующий ход и проверяем окончание партии заранее,
    // чтобы в онлайн-режиме синхронизировать состояние на сервер без задержки
    let nextTurn: Side = other(side);
    let matchOver = false;
    let matchWinner: Side | null = null;
    let matchReason = '';

    if (isWin(next, side)) {
      matchOver = true;
      matchWinner = side;
    } else if (plies.value >= MAX_PLIES) {
      matchOver = true;
      matchWinner = judgeByLimit(next);
      matchReason = 'Лимит ходов';
    } else if (!genMoves(next, nextTurn).length) {
      const alt = other(nextTurn);
      if (genMoves(next, alt).length) {
        nextTurn = alt;
      } else {
        matchOver = true;
        matchWinner = null;
        matchReason = 'Пат';
      }
    }

    if (mode.value === 'online' && activeRoom) {
      const moveId = `${getStableClientId()}_${plies.value}_${Date.now()}`;
      processedMoveIds.add(moveId);

      const syncedState: SyncedRoomGameState = {
        roomCode: roomCode.value || 'main_room',
        status: matchOver ? 'finished' : 'playing',
        board: next.slice(),
        turn: nextTurn,
        firstMove: firstMove.value,
        plies: plies.value,
        lastMove: mv,
        winner: matchWinner,
        reason: matchReason,
        seat1: seat1.value,
        seat2: seat2.value,
        updatedAt: Date.now(),
        version: ++stateVersion,
      };

      void pushRoomState(syncedState);
      void activeRoom.broadcast('player_action', {
        type: 'move',
        mv,
        side,
        plies: plies.value,
        moveId,
        state: syncedState,
      } satisfies PlayerActionPayload);
    }

    const myEpoch = epoch;
    if (animator) await animator.animateMove(mv, side);
    if (myEpoch !== epoch) return;
    sfx.land();

    board.value = next;
    turn.value = nextTurn;

    if (mode.value === 'ai') {
      saveAiSnapshot({
        board: next,
        turn: nextTurn,
        firstMove: firstMove.value,
        plies: plies.value,
        history: history.value,
        over: matchOver,
        winner: matchWinner,
        reason: matchReason,
      });
    }

    if (matchOver) {
      if (mode.value === 'online') roomStatus.value = 'finished';
      await finalizeMatchRewards(matchWinner, matchReason);
      return;
    }

    if (mode.value === 'ai' && turn.value === BOT) {
      void botTurn();
      return;
    }

    busy.value = false;
  }

  async function botTurn(): Promise<void> {
    if (over.value || mode.value !== 'ai') return;
    busy.value = true;
    const cfg = LEVELS[settings.level];
    const myEpoch = epoch;
    const t0 = performance.now();
    const res = await engine.search(board.value.slice(), BOT, cfg);
    if (over.value || myEpoch !== epoch || mode.value !== 'ai' || !res.move) {
      if (myEpoch === epoch) busy.value = false;
      return;
    }
    await delay(Math.max(0, 340 - (performance.now() - t0)));
    if (!over.value && myEpoch === epoch && mode.value === 'ai') {
      await playMove(res.move, BOT);
    }
  }

  function undo(): void {
    if (mode.value === 'online') {
      toast.show('В онлайн-матче отмена хода недоступна');
      return;
    }
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
    saveAiSnapshot({
      board: board.value,
      turn: turn.value,
      firstMove: firstMove.value,
      plies: plies.value,
      history: history.value,
      over: over.value,
      winner: winner.value,
      reason: reason.value,
    });
  }

  async function hint(): Promise<void> {
    if (busy.value || over.value) return;
    if (mode.value === 'online' && turn.value !== mySide.value) {
      toast.show('Подсказка доступна в ваш ход');
      return;
    }
    const myEpoch = epoch;
    const activeSide = mode.value === 'online' ? mySide.value : HUMAN;
    const res = await engine.search(board.value.slice(), activeSide, { depth: 5, ms: 500, jitter: 1 });
    if (over.value || myEpoch !== epoch || !res.move) return;
    animator?.showHint(res.move);
    toast.show('Подсказка: ' + (res.move.jumps ? 'цепочка прыжков' : 'тихий ход') + ' в отмеченный угол');
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

    if (mode.value === 'online' && activeRoom) {
      roomStatus.value = seat1.value && seat2.value ? 'playing' : 'waiting';
      const nextState = buildCurrentRoomState(roomStatus.value, null);
      void pushRoomState(nextState);
      void activeRoom.broadcast('player_action', {
        type: 'new_game',
        state: nextState,
      } satisfies PlayerActionPayload);
      return;
    }

    saveAiSnapshot({
      board: board.value,
      turn: turn.value,
      firstMove: firstMove.value,
      plies: 0,
      history: [],
      over: false,
      winner: null,
      reason: '',
    });

    if (turn.value === BOT) {
      busy.value = true;
      setTimeout(() => void botTurn(), 620);
    }
  }

  function setLevel(lvl: LevelId): void {
    settings.setLevel(lvl);
    void platform.syncSettingsToCloud(lvl, settings.sound);
    if (mode.value === 'online') {
      void leaveOnlineRoom();
    } else {
      newGame();
    }
    toast.show('Сложность: ' + LEVELS[lvl].label + ' · новая партия', 2400);
  }

  /** Инициализация при старте приложения (включая авто-реконнект к мультиплеер-комнате после F5). */
  async function initSession(): Promise<void> {
    let cloudRoomCode: string | null = null;
    await platform.init((restoredLvl, restoredSound, activeRoomFromCloud) => {
      settings.setLevel(restoredLvl);
      if (typeof restoredSound === 'boolean' && restoredSound !== settings.sound) {
        settings.toggleSound();
      }
      cloudRoomCode = activeRoomFromCloud ?? null;
    });

    const savedRoom = loadActiveRoomCode() || cloudRoomCode;
    if (savedRoom) {
      try {
        await joinOnlineRoom(savedRoom, true);
        return;
      } catch {
        saveActiveRoomCode(null);
      }
    }

    // Если активной онлайн-комнаты нет, проверяем сохранённую одиночную партию
    const aiSnap = loadAiSnapshot();
    if (aiSnap) {
      board.value = aiSnap.board;
      turn.value = aiSnap.turn;
      firstMove.value = aiSnap.firstMove;
      plies.value = aiSnap.plies;
      history.value = aiSnap.history || [];
      over.value = aiSnap.over;
      winner.value = aiSnap.winner;
      reason.value = aiSnap.reason;
      busy.value = false;
      if (turn.value === BOT && !over.value) {
        busy.value = true;
        setTimeout(() => void botTurn(), 500);
      }
      return;
    }

    newGame();
  }

  return {
    // состояние
    mode, board, turn, firstMove, mySide, oppSide, selected, plies, over, busy, winner, reason,
    movesByCell, progressYou, progressBot, historyLength, level,
    // мультиплеер и платформа
    roomCode, isHost, roomStatus, seat1, seat2, opponentName, isMyTurn,
    lastEarnedCoins, lastMatchScore,
    // действия
    initSession, attachAnimator, tapCell, playMove, undo, hint, newGame, setLevel,
    startQuickMatch, createOnlineRoom, joinOnlineRoom, leaveOnlineRoom,
  };
}

export type GameApi = ReturnType<typeof createGameSession>;

let instance: GameApi | null = null;

/** Singleton партии на всё приложение. */
export function useGame(): GameApi {
  if (!instance) instance = createGameSession();
  return instance;
}
