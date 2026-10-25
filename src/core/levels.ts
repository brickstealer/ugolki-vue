import type { SearchConfig } from './types';

/** Уровни сложности — те же параметры, что в оригинальной игре. */
export interface LevelConfig extends SearchConfig {
  label: string;
  desc: string;
}

export const LEVELS = {
  easy: { depth: 2, ms: 90, jitter: 9, blunder: 0.7, width: 22, label: 'Легко', desc: 'для знакомства' },
  normal: { depth: 4, ms: 280, jitter: 3.5, blunder: 0.14, width: 7, label: 'Средне', desc: 'ровная игра' },
  hard: { depth: 6, ms: 850, jitter: 1, label: 'Сложно', desc: 'наказывает за ошибки' },
  expert: { depth: 10, ms: 2000, jitter: 0.2, label: 'Эксперт', desc: 'считает глубже всех' },
} satisfies Record<string, LevelConfig>;

export type LevelId = keyof typeof LEVELS;
export const LEVEL_IDS = Object.keys(LEVELS) as LevelId[];
