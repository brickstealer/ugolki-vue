import { describe, expect, it } from 'vitest';
import {
  BOT, EMPTY, HUMAN, MAX_PLIES, N, TARGET,
  applyMove, countIn, createGame, dist, genMoves, idx, inZone,
  isWin, judgeByLimit, other, rowOf, colOf, search, unapplyMove,
} from '../index';
import type { Board, Side } from '../types';

function emptyBoard(): Board {
  return new Array(N * N).fill(EMPTY) as Board;
}

describe('rules', () => {
  it('стартовая позиция: по 9 шашек в домашних углах', () => {
    const b = createGame();
    expect(b.filter((p) => p === HUMAN)).toHaveLength(9);
    expect(b.filter((p) => p === BOT)).toHaveLength(9);
    expect(b[idx(0, 0)]).toBe(BOT);
    expect(b[idx(8, 8)]).toBe(HUMAN);
    // цели — чужие углы, поэтому на старте никто не «в углу соперника»
    expect(countIn(b, HUMAN)).toBe(0);
    expect(countIn(b, BOT)).toBe(0);
  });

  it('обычный ход — в любую из 8 соседних свободных клеток', () => {
    const b = emptyBoard();
    b[idx(4, 4)] = HUMAN;
    const moves = genMoves(b, HUMAN);
    expect(moves).toHaveLength(8);
    for (const m of moves) {
      expect(m.kind).toBe(0);
      expect(b[idx(m.to.r, m.to.c)]).toBe(EMPTY);
    }
  });

  it('прыжок через соседнюю шашку — свою тоже', () => {
    const b = emptyBoard();
    b[idx(4, 4)] = HUMAN;
    b[idx(4, 5)] = HUMAN; // своя шашка — через неё можно прыгнуть
    const dest = genMoves(b, HUMAN).filter((m) => m.kind === 1 && m.to.r === 4 && m.to.c === 6);
    expect(dest.length).toBeGreaterThanOrEqual(1);
    expect(dest[0].path).toEqual([{ r: 4, c: 4 }, { r: 4, c: 6 }]);
  });

  it('цепочка прыжков сохраняет все точки приземления в path', () => {
    const b = emptyBoard();
    b[idx(4, 4)] = HUMAN;
    b[idx(4, 5)] = BOT;
    b[idx(5, 6)] = BOT;
    const chain = genMoves(b, HUMAN).find(
      (m) => m.kind === 1 && m.path.length >= 3 && m.path[0].r === 4 && m.path[0].c === 4,
    );
    expect(chain).toBeDefined();
    expect(chain!.jumps).toBe(chain!.path.length - 1);
    // приземления не повторяются
    const keys = chain!.path.map((p) => idx(p.r, p.c));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('applyMove/unapplyMove — точная обратная операция', () => {
    const b = createGame();
    const snapshot = b.slice();
    const moves = genMoves(b, HUMAN);
    const m = moves.find((mv) => mv.kind === 1) ?? moves[0];
    applyMove(b, m, HUMAN);
    expect(b[idx(m.from.r, m.from.c)]).toBe(EMPTY);
    expect(b[idx(m.to.r, m.to.c)]).toBe(HUMAN);
    unapplyMove(b, m, HUMAN);
    expect(b).toEqual(snapshot);
  });

  it('нельзя приземлиться на занятую клетку', () => {
    const b = emptyBoard();
    b[idx(4, 4)] = HUMAN;
    b[idx(4, 5)] = BOT;
    b[idx(4, 6)] = BOT; // приземление занято — прыжка в эту сторону нет
    const moves = genMoves(b, HUMAN);
    expect(moves.some((m) => m.to.r === 4 && m.to.c === 6)).toBe(false);
  });

  it('победа — все 9 своих в чужом углу', () => {
    const b = emptyBoard();
    const z = TARGET[HUMAN];
    for (let r = z.r0; r <= z.r1; r++) for (let c = z.c0; c <= z.c1; c++) b[idx(r, c)] = HUMAN;
    expect(countIn(b, HUMAN)).toBe(9);
    expect(isWin(b, HUMAN)).toBe(true);
    expect(isWin(b, BOT)).toBe(false);
  });

  it('judgeByLimit: больше в углу — победа; равенство углов — ничья', () => {
    const a = emptyBoard();
    a[idx(0, 0)] = HUMAN; // 1 шашка в чужом углу
    a[idx(8, 0)] = BOT;   // 0 в углу, далеко от своего
    expect(judgeByLimit(a)).toBe(HUMAN);
    const draw = emptyBoard();
    draw[idx(0, 0)] = HUMAN;
    draw[idx(8, 8)] = BOT; // зеркально по 1 в углу
    expect(judgeByLimit(draw)).toBeNull();
  });

  it('вспомогательные функции координат и углов', () => {
    expect(idx(3, 5)).toBe(3 * N + 5);
    expect(rowOf(40)).toBe(4);
    expect(colOf(40)).toBe(4);
    expect(inZone(1, 1, TARGET[HUMAN])).toBe(true);
    expect(inZone(3, 1, TARGET[HUMAN])).toBe(false);
    // (6,6) до угла 0..2 по обеим осям: dr = dc = 6-2 = 4
    expect(dist(6, 6, TARGET[HUMAN])).toBe(4);
    expect(dist(1, 1, TARGET[HUMAN])).toBe(0);
    expect(other(HUMAN)).toBe(BOT);
    expect(MAX_PLIES).toBe(260);
  });

  it('движок находит ход на стартовой позиции', () => {
    const b = createGame();
    const r = search(b.slice(), BOT, { depth: 2, ms: 250 });
    expect(r.move).not.toBeNull();
    expect(r.nodes).toBeGreaterThan(0);
    const legal = genMoves(b, BOT);
    expect(legal.some((m) => m.from.r === r.move!.from.r && m.from.c === r.move!.from.c && m.to.r === r.move!.to.r && m.to.c === r.move!.to.c)).toBe(true);
  });
});
