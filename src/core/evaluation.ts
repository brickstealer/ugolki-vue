/** Эвристика и порядок перебора ходов — только чистые функции. */
import { HOME, TARGET, dist, idx, inZone, other } from './rules';
import type { Board, Move, Side } from './types';

/**
 * Оценка позиции для стороны `me`:
 * продвижение в чужой угол — главная цель; небольшой бонус за то,
 * что свой угол занят и сопернику некуда заходить.
 */
export function evaluate(board: Board, me: Side): number {
  const opp = other(me);
  const tm = TARGET[me];
  const to = TARGET[opp];
  const hm = HOME[me];
  let dm = 0;
  let dp = 0;
  let inM = 0;
  let inO = 0;
  let def = 0;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[idx(r, c)];
      if (p === 0) continue;
      if (p === me) {
        const d = dist(r, c, tm);
        dm += d;
        if (d === 0) inM++;
        if (inZone(r, c, hm)) def++;
      } else {
        const d2 = dist(r, c, to);
        dp += d2;
        if (d2 === 0) inO++;
      }
    }
  }
  return (dp - dm) * 3.5 + (inM - inO) * 90 + def * 0.7;
}

/** Сортировка ходов: сначала продвигающие к цели и длинные прыжки. */
export function orderMoves(moves: Move[], side: Side): void {
  const z = TARGET[side];
  const scored = moves.map((m) => ({
    m,
    s: (dist(m.from.r, m.from.c, z) - dist(m.to.r, m.to.c, z)) * 8 + m.jumps * 3,
  }));
  scored.sort((a, b) => b.s - a.s);
  moves.length = 0;
  moves.push(...scored.map((o) => o.m));
}
