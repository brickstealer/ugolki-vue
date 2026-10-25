/**
 * Тонкая обёртка над воркером движка: async-API с id-сопоставлением
 * ответов, тайм-аутом и graceful fallback на расчёт в main-потоке,
 * если worker недоступен (старое окружение, ошибки загрузки).
 */
import { search } from '@/core';
import type { LevelConfig, SearchConfig } from '@/core';
import type { Board, SearchResult, Side } from '@/core';
import type { EngineRequest, EngineResponse } from './protocol';

export interface EngineApi {
  search(board: Board, side: Side, cfg: SearchConfig | LevelConfig): Promise<SearchResult>;
}

function createEngine(): EngineApi {
  let worker: Worker | null = null;
  const pending = new Map<number, { resolve: (r: SearchResult) => void; timer: number }>();
  let seq = 0;

  try {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<EngineResponse>) => {
      const entry = pending.get(ev.data.id);
      if (!entry) return;
      pending.delete(ev.data.id);
      clearTimeout(entry.timer);
      entry.resolve({ move: ev.data.move, score: ev.data.score, depth: ev.data.depth, nodes: ev.data.nodes });
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }

  const syncSearch = (board: Board, side: Side, cfg: SearchConfig): SearchResult =>
    // search() мутирует доску — изолируем копию, board вызывающего целая
    search(board.slice(), side, cfg);

  return {
    search(board: Board, side: Side, cfg: SearchConfig): Promise<SearchResult> {
      if (!worker) {
        // отдаём микрозадачу, чтобы не морозить кадры лишний раз
        return new Promise((resolve) => {
          setTimeout(() => resolve(syncSearch(board, side, cfg)), 0);
        });
      }
      const id = ++seq;
      return new Promise<SearchResult>((resolve) => {
        const fallback = () => resolve(syncSearch(board, side, cfg));
        const timer = window.setTimeout(() => {
          if (pending.delete(id)) fallback();
        }, cfg.ms + 4000);
        pending.set(id, {
          resolve: (r) => {
            clearTimeout(timer);
            resolve(r);
          },
          timer,
        });
        const request: EngineRequest = { id, board, side, cfg };
        try {
          worker!.postMessage(request);
        } catch {
          pending.delete(id);
          clearTimeout(timer);
          fallback();
        }
      });
    },
  };
}

let instance: EngineApi | null = null;

/** Singleton движка на всё приложение. */
export function useEngine(): EngineApi {
  if (!instance) instance = createEngine();
  return instance;
}
