/**
 * Чистые правила «Уголков»: доска 9×9, ход/прыжок, победа, ничья.
 * Никаких side-эффектов, никаких зависимостей от окружения — слой легко
 * тестировать и запускать и в main-потоке, и в web-worker.
 */
import type { Board, Move, Piece, Point, Side, Zone } from './types';

export const N = 9;
export const EMPTY: Piece = 0;
export const HUMAN: Side = 1;
export const BOT: Side = 2;

/** 8 направлений: все соседние клетки. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];

export const ZONE_TL: Zone = { r0: 0, r1: 2, c0: 0, c1: 2 };
export const ZONE_BR: Zone = { r0: 6, r1: 8, c0: 6, c1: 8 };

/** Домашние углы и цели (угол соперника). */
export const HOME: Record<Side, Zone> = { 1: ZONE_BR, 2: ZONE_TL };
export const TARGET: Record<Side, Zone> = { 1: ZONE_TL, 2: ZONE_BR };

export const WIN_PIECES = 9;
export const MAX_PLIES = 260;

export const idx = (r: number, c: number): number => r * N + c;
export const rowOf = (k: number): number => (k / N) | 0;
export const colOf = (k: number): number => k % N;

export function other(side: Side): Side {
  return (3 - side) as Side;
}

export function createGame(): Board {
  const board = new Array<Piece>(N * N).fill(EMPTY);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      board[idx(i, j)] = BOT;
      board[idx(6 + i, 6 + j)] = HUMAN;
    }
  }
  return board;
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < N && c >= 0 && c < N;
}

export function inZone(r: number, c: number, z: Zone): boolean {
  return r >= z.r0 && r <= z.r1 && c >= z.c0 && c <= z.c1;
}

/** Расстояние Чебышёва от клетки до угла (0 — внутри угла). */
export function dist(r: number, c: number, z: Zone): number {
  const dr = r < z.r0 ? z.r0 - r : r > z.r1 ? r - z.r1 : 0;
  const dc = c < z.c0 ? z.c0 - c : c > z.c1 ? c - z.c1 : 0;
  return Math.max(dr, dc);
}

export function countIn(board: Board, side: Side): number {
  const z = TARGET[side];
  let n = 0;
  for (let r = z.r0; r <= z.r1; r++) {
    for (let c = z.c0; c <= z.c1; c++) {
      if (board[idx(r, c)] === side) n++;
    }
  }
  return n;
}

export function isWin(board: Board, side: Side): boolean {
  return countIn(board, side) === WIN_PIECES;
}

export function applyMove(board: Board, m: Move, side: Side): void {
  board[idx(m.from.r, m.from.c)] = EMPTY;
  board[idx(m.to.r, m.to.c)] = side;
}

export function unapplyMove(board: Board, m: Move, side: Side): void {
  board[idx(m.to.r, m.to.c)] = EMPTY;
  board[idx(m.from.r, m.from.c)] = side;
}

/**
 * Все ходы стороны: шаги в соседнюю свободную клетку и цепочки прыжков
 * через одну шашку (свою или чужую) на свободную клетку за ней.
 * Прыжки необязательны, шашки не бьются. Внутри одного хода нельзя
 * приземляться на уже посещённую клетку. Для каждой клетки приземления
 * сохраняется кратчайшая цепочка.
 */
export function genMoves(board: Board, side: Side): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[idx(r, c)] !== side) continue;
      const best = new Map<number, { path: Point[]; kind: 0 | 1 }>();

      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;

        if (board[idx(nr, nc)] === EMPTY) {
          const sk = idx(nr, nc);
          if (!best.has(sk)) best.set(sk, { path: [{ r, c }, { r: nr, c: nc }], kind: 0 });
          continue;
        }

        // первый прыжок возможен?
        const jr = nr + dr;
        const jc = nc + dc;
        if (!inBounds(jr, jc) || board[idx(jr, jc)] !== EMPTY) continue;

        const queue: Array<{ path: Point[]; seen: number[] }> = [
          { path: [{ r, c }, { r: jr, c: jc }], seen: [idx(r, c), idx(jr, jc)] },
        ];
        while (queue.length) {
          const cur = queue.pop()!;
          const last = cur.path[cur.path.length - 1];
          const lk = idx(last.r, last.c);
          const ex = best.get(lk);
          if (!ex || cur.path.length < ex.path.length) best.set(lk, { path: cur.path, kind: 1 });
          if (cur.path.length >= 9) continue;

          for (const [adr, adc] of DIRS) {
            const ar = last.r + adr;
            const ac = last.c + adc;
            const br = ar + adr;
            const bc = ac + adc;
            if (!inBounds(ar, ac) || !inBounds(br, bc)) continue;
            if (board[idx(ar, ac)] === EMPTY) continue;
            const bk = idx(br, bc);
            if (board[bk] !== EMPTY) continue;
            if (cur.seen.includes(bk)) continue;
            queue.push({
              path: [...cur.path, { r: br, c: bc }],
              seen: [...cur.seen, bk],
            });
          }
        }
      }

      for (const [k, v] of best) {
        out.push({
          from: { r, c },
          to: { r: rowOf(k), c: colOf(k) },
          path: v.path,
          kind: v.kind,
          jumps: v.kind ? v.path.length - 1 : 0,
        });
      }
    }
  }
  return out;
}

/**
 * Итог по лимиту полуходов: побеждает тот, кто перевёл в чужой угол
 * больше шашек; при равенстве — чьи шашки в среднем ближе к цели.
 */
export function judgeByLimit(board: Board): Side | null {
  const score = (side: Side): number => {
    const z = TARGET[side];
    let inCorner = 0;
    let dsum = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (board[idx(r, c)] !== side) continue;
        const d = dist(r, c, z);
        if (d === 0) inCorner++;
        dsum += d;
      }
    }
    return inCorner * 1000 - dsum;
  };
  const a = score(HUMAN);
  const b = score(BOT);
  return a === b ? null : a > b ? HUMAN : BOT;
}
