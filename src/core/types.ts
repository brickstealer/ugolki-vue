/** Доменные типы игры «Уголки». Слой не знает ни о Vue, ни о Three.js. */

/** Пустая клетка — 0, игрок — 1, ИИ — 2. */
export type Piece = 0 | 1 | 2;
/** Сторона (без пустой клетки). */
export type Side = 1 | 2;

/** Клетка доски (строка, столбец). */
export interface Point {
  r: number;
  c: number;
}

/**
 * Ход: из `from` в `to`.
 * `path` — [старт, ...точки приземления]: для шага 2 точки,
 * для прыжков — по одной точке приземления на каждый прыжок.
 * `kind` — 0 обычный ход, 1 прыжок(и).
 */
export interface Move {
  from: Point;
  to: Point;
  path: Point[];
  kind: 0 | 1;
  jumps: number;
}

/** Уголок 3×3 на доске. */
export interface Zone {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/** Плоское представление доски: длина N*N, значения Piece. */
export type Board = Piece[];

/** Параметры поиска (уровень сложности). */
export interface SearchConfig {
  depth: number;
  ms: number;
  jitter?: number;
  blunder?: number;
  width?: number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
}
