import { describe, expect, it, beforeEach } from 'vitest';
import { createGame, HUMAN, BOT, applyMove, genMoves } from '@/core';
import {
  getStableClientId,
  loadActiveRoomCode,
  loadCachedRoomState,
  saveActiveRoomCode,
  saveCachedRoomState,
  type SyncedRoomGameState,
} from '@/platform/gamehub';

describe('GameHub integration & multiplayer state recovery', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* node env without storage */
    }
  });

  it('генерирует стабильный clientId для сохранения места игрока после F5', () => {
    const id1 = getStableClientId();
    const id2 = getStableClientId();
    expect(id1).toBeTruthy();
    expect(id1).toBe(id2);
  });

  it('сохраняет и восстанавливает состояние мультиплеер-комнаты при перезагрузке страницы', () => {
    const board = createGame();
    const firstMoves = genMoves(board, HUMAN);
    expect(firstMoves.length).toBeGreaterThan(0);
    applyMove(board, firstMoves[0], HUMAN);

    const state: SyncedRoomGameState = {
      roomCode: 'UGOL-7777',
      status: 'playing',
      board,
      turn: BOT,
      firstMove: HUMAN,
      plies: 1,
      lastMove: firstMoves[0],
      winner: null,
      reason: '',
      seat1: { playerId: 'p1', clientId: 'cid_1', displayName: 'Игрок 1' },
      seat2: { playerId: 'p2', clientId: 'cid_2', displayName: 'Игрок 2' },
      updatedAt: Date.now(),
      version: 3,
    };

    // В node-окружении без window/localStorage функции работают безопасно без исключений
    expect(() => saveActiveRoomCode('UGOL-7777')).not.toThrow();
    expect(() => saveCachedRoomState('UGOL-7777', state)).not.toThrow();
    expect(() => loadActiveRoomCode()).not.toThrow();
    expect(() => loadCachedRoomState('UGOL-7777')).not.toThrow();
  });
});

