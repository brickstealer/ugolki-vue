/**
 * Интеграция с платформой GameHub:
 * - инициализация SDK (`new GameHub()`, `hub.getUser()`);
 * - таблица рекордов (`hub.leaderboards.submitScore`, `hub.leaderboards.getTop`);
 * - облачные сохранения (`hub.state.get`, `hub.state.set`, `hub.state.patch` со `scope: 'player'`);
 * - мультиплеер реального времени (`hub.realtime.quickMatch`, `hub.realtime.joinRoom`,
 *   `room.syncState('game_state', ...)`, `room.on('state:game_state', ...)`,
 *   `room.broadcast('player_action', ...)`, `room.on('player_action', ...)`,
 *   `room.isHost`, `room.on('host_changed', ...)`).
 *
 * Если скрипт `/gamehub/sdk.js` не загружен (например, при локальной разработке вне хоста),
 * автоматически подключается совместимый локальный полифилл на `localStorage` + `BroadcastChannel`,
 * позволяющий тестировать мультиплеер между вкладками браузера.
 */
import { ref } from 'vue';
import type { Board, LevelId, Move, Point, Side } from '@/core';

export interface GameHubUser {
  isAuthenticated: boolean;
  playerId: string;
  displayName: string;
}

export interface LeaderboardEntry {
  rank?: number;
  playerId?: string;
  displayName?: string;
  playerName?: string;
  name?: string;
  score: number;
  value?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  playerEntry: LeaderboardEntry | null;
}

export interface PlayerCloudSave {
  level: number;
  levelId?: LevelId;
  coins: number;
  wins: number;
  gamesPlayed: number;
  bestScore: number;
  sound?: boolean;
  activeRoomCode?: string | null;
}

export interface RoomSeat {
  playerId: string;
  clientId: string;
  displayName: string;
}

export interface SyncedRoomGameState {
  roomCode: string;
  status: 'waiting' | 'playing' | 'finished';
  board: Board;
  turn: Side;
  firstMove: Side;
  plies: number;
  lastMove: Move | null;
  winner: Side | null;
  reason: string;
  seat1: RoomSeat | null;
  seat2: RoomSeat | null;
  updatedAt: number;
  version: number;
}

export type PlayerActionPayload =
  | {
      type: 'hello';
      playerId: string;
      clientId: string;
      displayName: string;
    }
  | {
      type: 'move';
      mv: Move;
      side: Side;
      plies: number;
      moveId: string;
      state: SyncedRoomGameState;
    }
  | {
      type: 'new_game';
      state: SyncedRoomGameState;
    }
  | {
      type: 'sync_snapshot';
      state: SyncedRoomGameState;
    }
  | {
      type: 'leave';
      playerId: string;
      clientId: string;
    };

export interface GameHubRoom {
  id?: string;
  roomId?: string;
  code?: string;
  name?: string;
  isHost: boolean;
  state?: Record<string, unknown>;
  on(event: 'host_changed', handler: (data: { isHost: boolean }) => void): void;
  on(event: 'state:game_state', handler: (state: unknown) => void): void;
  on(
    event: 'player_action',
    handler: (data: { senderId?: string; payload?: unknown } & Record<string, unknown>) => void,
  ): void;
  on(event: string, handler: (...args: any[]) => void): void;
  syncState(key: 'game_state' | string, state: unknown): Promise<void>;
  broadcast(event: 'player_action' | string, payload: unknown): Promise<void>;
  leave?(): Promise<void> | void;
  disconnect?(): Promise<void> | void;
}

export interface GameHubClient {
  getUser(): Promise<GameHubUser>;
  leaderboards: {
    submitScore(boardName: string, score: number, options?: { mode?: 'best' | 'last' | 'add' }): Promise<void>;
    getTop(boardName: string, options?: { limit?: number }): Promise<LeaderboardResponse>;
  };
  state: {
    set(key: string, value: unknown, options?: { scope?: 'player' | 'global' }): Promise<void>;
    patch(key: string, value: Record<string, unknown>, options?: { scope?: 'player' | 'global' }): Promise<void>;
    get<T = PlayerCloudSave>(key: string, options?: { scope?: 'player' | 'global' }): Promise<T | null>;
  };
  realtime: {
    quickMatch(options?: { maxPlayers?: number }): Promise<GameHubRoom>;
    joinRoom(roomCode: string): Promise<GameHubRoom>;
  };
}

declare global {
  interface Window {
    GameHub?: new () => GameHubClient;
  }
  var GameHub: new () => GameHubClient;
}

const CLIENT_ID_KEY = 'ugolki.gamehub.client_id';
const ACTIVE_ROOM_KEY = 'ugolki.gamehub.active_room';
const ROOM_CACHE_PREFIX = 'ugolki.gamehub.room_state.';

/** Стабильный ID браузерной вкладки/клиента, сохраняющийся при обновлении страницы (F5). */
export function getStableClientId(): string {
  try {
    let cid = sessionStorage.getItem(CLIENT_ID_KEY) || localStorage.getItem(CLIENT_ID_KEY);
    if (!cid) {
      cid = 'cid_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
    }
    sessionStorage.setItem(CLIENT_ID_KEY, cid);
    localStorage.setItem(CLIENT_ID_KEY, cid);
    return cid;
  } catch {
    return 'cid_fallback';
  }
}

/* ---------- Локальный полифилл GameHub SDK (на случай запуска вне сервера платформы) ---------- */
function ensureGameHubSdk(): void {
  if (typeof window !== 'undefined' && typeof window.GameHub === 'function') return;

  class LocalFallbackRoom implements GameHubRoom {
    id: string;
    roomId: string;
    code: string;
    isHost = false;
    state: Record<string, unknown> = {};
    private handlers = new Map<string, Set<(...args: any[]) => void>>();
    private bc: BroadcastChannel | null = null;
    private senderId: string;
    private peers = new Set<string>();
    private heartbeatTimer: number | undefined;

    constructor(code: string, senderId: string) {
      this.id = code;
      this.roomId = code;
      this.code = code;
      this.senderId = senderId;

      const cached = loadCachedRoomState(code);
      if (cached) {
        this.state.game_state = cached;
      }

      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel(`gamehub_room_${code}`);
        this.bc.onmessage = (ev) => this.handleMessage(ev.data);
      }

      // Определяем хоста среди активных вкладок
      this.peers.add(this.senderId);
      this.recomputeHost();
      this.postRaw({ kind: 'peer_join', senderId: this.senderId });

      // Отдаём сохранённое состояние комнаты при входе (как делает сервер GameHub)
      setTimeout(() => {
        const st = loadCachedRoomState(code);
        if (st) {
          this.state.game_state = st;
          this.emit('state:game_state', st);
        }
      }, 30);

      this.heartbeatTimer = window.setInterval(() => {
        this.postRaw({ kind: 'peer_ping', senderId: this.senderId });
      }, 2500);
    }

    private postRaw(msg: Record<string, unknown>): void {
      try {
        this.bc?.postMessage(msg);
      } catch {
        /* ignore */
      }
    }

    private recomputeHost(): void {
      const sorted = [...this.peers].sort();
      const nextHost = sorted[0] === this.senderId;
      if (nextHost !== this.isHost) {
        this.isHost = nextHost;
        this.emit('host_changed', { isHost: this.isHost });
      }
    }

    private handleMessage(data: any): void {
      if (!data || typeof data !== 'object') return;
      if (data.kind === 'peer_join') {
        this.peers.add(data.senderId);
        this.recomputeHost();
        this.postRaw({ kind: 'peer_ack', senderId: this.senderId, state: this.state.game_state });
      } else if (data.kind === 'peer_ack') {
        this.peers.add(data.senderId);
        this.recomputeHost();
        if (data.state && !this.state.game_state) {
          this.state.game_state = data.state;
          this.emit('state:game_state', data.state);
        }
      } else if (data.kind === 'peer_ping') {
        if (!this.peers.has(data.senderId)) {
          this.peers.add(data.senderId);
          this.recomputeHost();
        }
      } else if (data.kind === 'peer_leave') {
        this.peers.delete(data.senderId);
        this.recomputeHost();
      } else if (data.kind === 'sync_state') {
        this.state[data.key] = data.state;
        this.emit(`state:${data.key}`, data.state);
      } else if (data.kind === 'broadcast') {
        this.emit(data.event, { senderId: data.senderId, payload: data.payload });
      }
    }

    on(event: string, handler: (...args: any[]) => void): void {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(handler);
    }

    private emit(event: string, data: unknown): void {
      const set = this.handlers.get(event);
      if (!set) return;
      for (const fn of set) fn(data);
    }

    async syncState(key: string, state: unknown): Promise<void> {
      this.state[key] = state;
      if (key === 'game_state' && state) {
        saveCachedRoomState(this.code, state as SyncedRoomGameState);
      }
      this.postRaw({ kind: 'sync_state', key, state, senderId: this.senderId });
      this.emit(`state:${key}`, state);
    }

    async broadcast(event: string, payload: unknown): Promise<void> {
      this.postRaw({ kind: 'broadcast', event, payload, senderId: this.senderId });
    }

    async leave(): Promise<void> {
      if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
      this.postRaw({ kind: 'peer_leave', senderId: this.senderId });
      this.bc?.close();
      this.bc = null;
    }
  }

  class LocalFallbackGameHub implements GameHubClient {
    private user: GameHubUser;

    constructor() {
      const cid = getStableClientId();
      const short = cid.replace(/^cid_/, '').slice(0, 4).toUpperCase();
      this.user = {
        isAuthenticated: false,
        playerId: `guest_${short}`,
        displayName: `Игрок #${short}`,
      };
    }

    async getUser(): Promise<GameHubUser> {
      return this.user;
    }

    leaderboards = {
      submitScore: async (boardName: string, score: number, options?: { mode?: 'best' | 'last' | 'add' }): Promise<void> => {
        try {
          const key = `ugolki.gh.lb.${boardName}`;
          const raw = localStorage.getItem(key);
          const list: LeaderboardEntry[] = raw ? JSON.parse(raw) : [
            { playerId: 'bot_gm', displayName: 'Гроссмейстер ИИ', score: 3450 },
            { playerId: 'bot_m1', displayName: 'Алексей К.', score: 2890 },
            { playerId: 'bot_m2', displayName: 'Мария С.', score: 2410 },
            { playerId: 'bot_m3', displayName: 'Дмитрий В.', score: 1950 },
          ];
          const idx = list.findIndex((e) => e.playerId === this.user.playerId);
          if (idx >= 0) {
            if (options?.mode === 'best') {
              list[idx].score = Math.max(list[idx].score, score);
            } else if (options?.mode === 'add') {
              list[idx].score += score;
            } else {
              list[idx].score = score;
            }
            list[idx].displayName = this.user.displayName;
          } else {
            list.push({
              playerId: this.user.playerId,
              displayName: this.user.displayName,
              score,
            });
          }
          list.sort((a, b) => b.score - a.score);
          list.forEach((e, i) => {
            e.rank = i + 1;
          });
          localStorage.setItem(key, JSON.stringify(list));
        } catch {
          /* ignore */
        }
      },
      getTop: async (boardName: string, options?: { limit?: number }): Promise<LeaderboardResponse> => {
        const limit = options?.limit ?? 10;
        try {
          const key = `ugolki.gh.lb.${boardName}`;
          const raw = localStorage.getItem(key);
          const list: LeaderboardEntry[] = raw
            ? JSON.parse(raw)
            : [
                { rank: 1, playerId: 'bot_gm', displayName: 'Гроссмейстер ИИ', score: 3450 },
                { rank: 2, playerId: 'bot_m1', displayName: 'Алексей К.', score: 2890 },
                { rank: 3, playerId: 'bot_m2', displayName: 'Мария С.', score: 2410 },
                { rank: 4, playerId: 'bot_m3', displayName: 'Дмитрий В.', score: 1950 },
              ];
          list.sort((a, b) => b.score - a.score);
          list.forEach((e, i) => {
            e.rank = i + 1;
          });
          const playerEntry = list.find((e) => e.playerId === this.user.playerId) ?? null;
          return {
            entries: list.slice(0, limit),
            playerEntry,
          };
        } catch {
          return { entries: [], playerEntry: null };
        }
      },
    };

    state = {
      set: async (key: string, value: unknown, _options?: { scope?: 'player' | 'global' }): Promise<void> => {
        try {
          localStorage.setItem(`ugolki.gh.state.${key}`, JSON.stringify(value));
        } catch {
          /* ignore */
        }
      },
      patch: async (key: string, value: Record<string, unknown>, _options?: { scope?: 'player' | 'global' }): Promise<void> => {
        try {
          const storageKey = `ugolki.gh.state.${key}`;
          const prevRaw = localStorage.getItem(storageKey);
          const prev = prevRaw ? JSON.parse(prevRaw) : {};
          const next = { ...(typeof prev === 'object' && prev ? prev : {}), ...value };
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      },
      get: async <T = PlayerCloudSave>(key: string, _options?: { scope?: 'player' | 'global' }): Promise<T | null> => {
        try {
          const raw = localStorage.getItem(`ugolki.gh.state.${key}`);
          return raw ? (JSON.parse(raw) as T) : null;
        } catch {
          return null;
        }
      },
    };

    realtime = {
      quickMatch: async (_options?: { maxPlayers?: number }): Promise<GameHubRoom> => {
        return new LocalFallbackRoom('main_room', this.user.playerId);
      },
      joinRoom: async (roomCode: string): Promise<GameHubRoom> => {
        const clean = roomCode.trim() || 'main_room';
        return new LocalFallbackRoom(clean, this.user.playerId);
      },
    };
  }

  if (typeof window !== 'undefined') {
    window.GameHub = LocalFallbackGameHub;
  }
}

/* ---------- Кэширование состояния комнаты для мгновенного восстановления после F5 ---------- */

export function saveActiveRoomCode(code: string | null): void {
  try {
    if (code) {
      sessionStorage.setItem(ACTIVE_ROOM_KEY, code);
      localStorage.setItem(ACTIVE_ROOM_KEY, code);
      const url = new URL(window.location.href);
      url.searchParams.set('room', code);
      window.history.replaceState({}, '', url.toString());
    } else {
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);
      localStorage.removeItem(ACTIVE_ROOM_KEY);
      const url = new URL(window.location.href);
      if (url.searchParams.has('room')) {
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      }
    }
  } catch {
    /* ignore */
  }
}

export function loadActiveRoomCode(): string | null {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('room');
    if (fromQuery && fromQuery.trim()) return fromQuery.trim();
    return sessionStorage.getItem(ACTIVE_ROOM_KEY) || localStorage.getItem(ACTIVE_ROOM_KEY) || null;
  } catch {
    return null;
  }
}

export function saveCachedRoomState(code: string, state: SyncedRoomGameState): void {
  try {
    localStorage.setItem(ROOM_CACHE_PREFIX + code, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadCachedRoomState(code: string): SyncedRoomGameState | null {
  try {
    const raw = localStorage.getItem(ROOM_CACHE_PREFIX + code);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncedRoomGameState;
    if (parsed && Array.isArray(parsed.board) && parsed.board.length === 81) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------- Singleton-сервис платформы GameHub ---------- */

const LEVEL_TO_NUM: Record<LevelId, number> = {
  easy: 1,
  normal: 2,
  hard: 3,
  expert: 4,
};

const NUM_TO_LEVEL: Record<number, LevelId> = {
  1: 'easy',
  2: 'normal',
  3: 'hard',
  4: 'expert',
};

function createPlatformService() {
  ensureGameHubSdk();
  const hub = new GameHub();

  const user = ref<GameHubUser>({
    isAuthenticated: false,
    playerId: getStableClientId(),
    displayName: 'Игрок',
  });
  const ready = ref(false);
  const coins = ref(50);
  const wins = ref(0);
  const gamesPlayed = ref(0);
  const bestScore = ref(0);

  const leaderboardEntries = ref<LeaderboardEntry[]>([]);
  const playerLeaderboardEntry = ref<LeaderboardEntry | null>(null);
  const leaderboardLoading = ref(false);

  async function init(onRestoredLevel?: (lvl: LevelId, sound?: boolean, roomCode?: string | null) => void): Promise<void> {
    try {
      const player = await hub.getUser();
      if (player && player.playerId) {
        user.value = {
          isAuthenticated: Boolean(player.isAuthenticated),
          playerId: String(player.playerId),
          displayName: String(player.displayName || 'Игрок'),
        };
      }
    } catch {
      /* остаёмся с гостевым профилем */
    }

    // Загружаем облачное сохранение через State API
    try {
      const rawSave = await hub.state.get<any>('save', { scope: 'player' });
      const save: Partial<PlayerCloudSave> | null =
        rawSave && typeof rawSave === 'object' && 'value' in rawSave && typeof rawSave.value === 'object'
          ? rawSave.value
          : rawSave;

      if (save && typeof save === 'object') {
        if (typeof save.coins === 'number') coins.value = save.coins;
        if (typeof save.wins === 'number') wins.value = save.wins;
        if (typeof save.gamesPlayed === 'number') gamesPlayed.value = save.gamesPlayed;
        if (typeof save.bestScore === 'number') bestScore.value = save.bestScore;

        const restoredLevel: LevelId =
          save.levelId && save.levelId in LEVEL_TO_NUM
            ? save.levelId
            : typeof save.level === 'number' && NUM_TO_LEVEL[save.level]
              ? NUM_TO_LEVEL[save.level]
              : 'normal';

        onRestoredLevel?.(restoredLevel, save.sound, save.activeRoomCode ?? null);
      } else {
        // Инициализируем базовое сохранение по спецификации GameHub
        await hub.state.set(
          'save',
          {
            level: 2,
            levelId: 'normal',
            coins: 50,
            wins: 0,
            gamesPlayed: 0,
            bestScore: 0,
            sound: true,
            activeRoomCode: null,
          },
          { scope: 'player' },
        );
      }
    } catch {
      /* ignore state errors */
    }

    ready.value = true;
    void fetchLeaderboard();
  }

  async function patchSave(patchData: Partial<PlayerCloudSave>): Promise<void> {
    if (typeof patchData.coins === 'number') coins.value = patchData.coins;
    if (typeof patchData.wins === 'number') wins.value = patchData.wins;
    if (typeof patchData.gamesPlayed === 'number') gamesPlayed.value = patchData.gamesPlayed;
    if (typeof patchData.bestScore === 'number') bestScore.value = patchData.bestScore;

    try {
      await hub.state.patch('save', patchData as Record<string, unknown>, { scope: 'player' });
    } catch {
      /* fallback to set */
      try {
        await hub.state.set(
          'save',
          {
            level: patchData.level ?? 2,
            coins: coins.value,
            wins: wins.value,
            gamesPlayed: gamesPlayed.value,
            bestScore: bestScore.value,
            ...patchData,
          },
          { scope: 'player' },
        );
      } catch {
        /* ignore */
      }
    }
  }

  async function syncSettingsToCloud(levelId: LevelId, sound: boolean): Promise<void> {
    await patchSave({
      level: LEVEL_TO_NUM[levelId] ?? 2,
      levelId,
      sound,
    });
  }

  async function recordMatchResult(params: {
    won: boolean;
    draw: boolean;
    plies: number;
    levelId: LevelId;
    isOnline: boolean;
  }): Promise<{ earnedCoins: number; matchScore: number }> {
    const nextGames = gamesPlayed.value + 1;
    const nextWins = params.won ? wins.value + 1 : wins.value;
    const earnedCoins = params.won ? (params.isOnline ? 50 : 25) : params.draw ? 10 : 5;
    const nextCoins = coins.value + earnedCoins;

    let matchScore = 0;
    if (params.won) {
      const base = params.isOnline
        ? 2500
        : params.levelId === 'expert'
          ? 3000
          : params.levelId === 'hard'
            ? 2200
            : params.levelId === 'normal'
              ? 1500
              : 1000;
      const speedBonus = Math.max(0, (130 - params.plies) * 18);
      matchScore = base + speedBonus + nextWins * 40;
    } else if (params.draw) {
      matchScore = 600 + nextWins * 25;
    } else {
      matchScore = Math.max(100, bestScore.value);
    }

    const nextBest = Math.max(bestScore.value, matchScore);

    await patchSave({
      coins: nextCoins,
      wins: nextWins,
      gamesPlayed: nextGames,
      bestScore: nextBest,
    });

    if (matchScore > 0) {
      try {
        await hub.leaderboards.submitScore('highscores', nextBest, { mode: 'best' });
        await fetchLeaderboard();
      } catch {
        /* ignore */
      }
    }

    return { earnedCoins, matchScore };
  }

  async function fetchLeaderboard(): Promise<void> {
    leaderboardLoading.value = true;
    try {
      const lb = await hub.leaderboards.getTop('highscores', { limit: 10 });
      if (Array.isArray(lb)) {
        leaderboardEntries.value = lb;
        playerLeaderboardEntry.value = lb.find((e) => e.playerId === user.value.playerId) ?? null;
      } else if (lb && typeof lb === 'object') {
        leaderboardEntries.value = Array.isArray(lb.entries) ? lb.entries : [];
        playerLeaderboardEntry.value = lb.playerEntry ?? null;
      }
    } catch {
      /* ignore */
    } finally {
      leaderboardLoading.value = false;
    }
  }

  return {
    hub,
    user,
    ready,
    coins,
    wins,
    gamesPlayed,
    bestScore,
    leaderboardEntries,
    playerLeaderboardEntry,
    leaderboardLoading,
    init,
    patchSave,
    syncSettingsToCloud,
    recordMatchResult,
    fetchLeaderboard,
  };
}

export type PlatformService = ReturnType<typeof createPlatformService>;

let platformInstance: PlatformService | null = null;

export function usePlatform(): PlatformService {
  if (!platformInstance) platformInstance = createPlatformService();
  return platformInstance;
}
