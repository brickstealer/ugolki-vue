/**
 * Web-worker движка: тяжёлый поиск (negamax до 10 глубины, до 2 секунд)
 * выполняется вне main-потока. Ядро правил импортируется напрямую —
 * один исходник и для приложения, и для воркера.
 */
import { search } from '@/core';
import type { EngineRequest, EngineResponse } from './protocol';

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<EngineRequest>) => void) | null;
  postMessage(message: EngineResponse): void;
};

ctx.onmessage = (ev) => {
  const { id, board, side, cfg } = ev.data;
  const r = search(board, side, cfg);
  ctx.postMessage({ id, move: r.move, score: r.score, depth: r.depth, nodes: r.nodes });
};
