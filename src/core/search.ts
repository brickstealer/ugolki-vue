/**
 * Поиск хода: итеративное углубление + negamax с альфа-бета отсечением.
 * Порт алгоритма из оригинальной игры; исполняется синхронно — снаружи
 * (движок в web-worker) это не блокирует UI.
 */
import { evaluate, orderMoves } from './evaluation';
import { applyMove, genMoves, isWin, other, unapplyMove } from './rules';
import type { Board, Move, SearchConfig, SearchResult, Side } from './types';

const INF = 1e9;
const WINV = 1e5;

const now: () => number =
  typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => Date.now();

interface SearchCtx {
  nodes: number;
  t0: number;
  ms: number;
  timeUp: boolean;
}

function negamax(
  board: Board,
  side: Side,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchCtx,
  ply: number,
  rev: Move | null,
): number {
  ctx.nodes++;
  if ((ctx.nodes & 511) === 0 && now() - ctx.t0 > ctx.ms) ctx.timeUp = true;
  if (ctx.timeUp || depth <= 0) return evaluate(board, side);

  const moves = genMoves(board, side);
  if (!moves.length) {
    // нет ходов: проигрыш тем ближе, чем раньше случилось; пат — ничья
    return genMoves(board, other(side)).length ? -30 + ply : 0;
  }
  orderMoves(moves, side);

  let best = -INF;
  for (const m of moves) {
    if (moves.length > 2 && isReverse(m, rev)) continue;
    applyMove(board, m, side);
    const s = isWin(board, side) ? WINV - ply : -negamax(board, other(side), depth - 1, -beta, -alpha, ctx, ply + 1, m);
    unapplyMove(board, m, side);
    if (ctx.timeUp) break;
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best > -INF ? best : evaluate(board, side);
}

/** Не ходить туда, откуда соперник только что пришёл (защита от маятника). */
function isReverse(m: Move, rev: Move | null): boolean {
  return (
    !!rev &&
    m.from.r === rev.to.r && m.from.c === rev.to.c &&
    m.to.r === rev.from.r && m.to.c === rev.from.c
  );
}

/**
 * Поиск лучшего хода. `cfg.jitter` — шум оценок (человечность игры),
 * `cfg.blunder` — вероятность выбрать не лучший, но достойный ход.
 * ВАЖНО: функция мутирует `board` (make/unmake ходов), передавайте копию.
 */
export function search(board: Board, side: Side, cfg: SearchConfig): SearchResult {
  const ctx: SearchCtx = { nodes: 0, t0: now(), ms: cfg.ms ?? 250, timeUp: false };
  let root = genMoves(board, side);
  if (!root.length) return { move: null, score: 0, depth: 0, nodes: 0 };
  orderMoves(root, side);

  let best: Move = root[0];
  let bestScore = -INF;
  let scored: Array<{ m: Move; s: number }> | null = null;
  let completed = 0;
  const maxD = cfg.depth || 3;

  for (let d = 1; d <= maxD; d++) {
    let alpha = -INF;
    const list: Array<{ m: Move; s: number }> = [];
    let localBest: Move | null = null;
    let localScore = -INF;

    for (const m of root) {
      applyMove(board, m, side);
      const s = isWin(board, side) ? WINV : -negamax(board, other(side), d - 1, -INF, -alpha, ctx, 1, m);
      unapplyMove(board, m, side);
      if (ctx.timeUp) break;
      list.push({ m, s: s + (Math.random() * 2 - 1) * (cfg.jitter ?? 0) });
      if (list[list.length - 1].s > localScore) {
        localScore = list[list.length - 1].s;
        localBest = m;
      }
      if (list[list.length - 1].s > alpha) alpha = list[list.length - 1].s;
    }
    if (ctx.timeUp) break;

    if (list.length) {
      scored = list;
      completed = d;
      if (localBest) {
        best = localBest;
        bestScore = localScore;
      }
      scored.sort((a, b) => b.s - a.s);
      root = scored.map((o) => o.m);
    }
    if (bestScore > WINV - 1000 || now() - ctx.t0 > ctx.ms) break;
  }

  let pick = best;
  if (cfg.blunder && scored && scored.length > 1 && Math.random() < cfg.blunder) {
    const w = cfg.width ?? 10;
    const pool = scored.filter((o) => o.s >= scored![0].s - w);
    if (pool.length > 1) pick = pool[(Math.random() * pool.length) | 0].m;
  }
  return { move: pick, score: bestScore, depth: completed, nodes: ctx.nodes };
}
