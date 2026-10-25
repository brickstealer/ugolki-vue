import type { Board, SearchConfig, SearchResult, Side } from '@/core';

/** Запрос к воркеру движка. `board` копируется structured clone'ом. */
export interface EngineRequest {
  id: number;
  board: Board;
  side: Side;
  cfg: SearchConfig;
}

/** Ответ воркера — SearchResult плюс id запроса. */
export interface EngineResponse extends SearchResult {
  id: number;
}
