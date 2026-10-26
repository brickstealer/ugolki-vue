<script setup lang="ts">
import { ref } from 'vue';
import { HUMAN } from '@/core';
import { useGame } from '@/game/useGame';
import { usePlatform } from '@/platform/gamehub';
import { useToast } from '@/composables/useToast';
import BaseModal from './BaseModal.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const game = useGame();
const platform = usePlatform();
const toast = useToast();

const joinCodeInput = ref('');
const customRoomInput = ref('');
const loadingAction = ref(false);

function close(): void {
  emit('update:open', false);
}

async function onQuickMatch(): Promise<void> {
  if (loadingAction.value) return;
  loadingAction.value = true;
  try {
    await game.startQuickMatch();
    close();
  } finally {
    loadingAction.value = false;
  }
}

async function onCreateRoom(): Promise<void> {
  if (loadingAction.value) return;
  loadingAction.value = true;
  try {
    await game.createOnlineRoom(customRoomInput.value);
    customRoomInput.value = '';
  } finally {
    loadingAction.value = false;
  }
}

async function onJoinByCode(codeOverride?: string): Promise<void> {
  const code = (codeOverride ?? joinCodeInput.value).trim();
  if (!code) {
    toast.show('Введите код комнаты');
    return;
  }
  if (loadingAction.value) return;
  loadingAction.value = true;
  try {
    await game.joinOnlineRoom(code);
    joinCodeInput.value = '';
    close();
  } finally {
    loadingAction.value = false;
  }
}

async function copyRoomCode(): Promise<void> {
  const code = game.roomCode.value;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast.show(`Код комнаты ${code} скопирован!`);
  } catch {
    toast.show(`Код комнаты: ${code}`);
  }
}

async function onLeaveRoom(): Promise<void> {
  await game.leaveOnlineRoom();
  close();
}
</script>

<template>
  <BaseModal :open="open" @close="close">
    <div class="gh-head">
      <div>
        <h2>Онлайн · GameHub</h2>
        <p class="gh-sub">Мультиплеер в реальном времени (SignalR)</p>
      </div>
      <div class="gh-user-badge">
        <span class="gh-dot" :class="{ auth: platform.user.value.isAuthenticated }" />
        <span>{{ platform.user.value.displayName }}</span>
      </div>
    </div>

    <!-- Активная комната -->
    <div v-if="game.mode.value === 'online' && game.roomCode.value" class="room-box">
      <div class="room-top">
        <div>
          <div class="room-label">КОД КОМНАТЫ</div>
          <div class="room-code">{{ game.roomCode.value }}</div>
        </div>
        <button type="button" class="btn-mini" @click="copyRoomCode">Скопировать</button>
      </div>

      <div class="room-badges">
        <span class="badge" :class="game.roomStatus.value">
          {{
            game.roomStatus.value === 'playing'
              ? '● Партия идёт'
              : game.roomStatus.value === 'finished'
                ? 'Партия завершена'
                : '⏳ Ожидание второго игрока…'
          }}
        </span>
        <span v-if="game.isHost.value" class="badge host">👑 Хост комнаты</span>
      </div>

      <div class="seats">
        <div
          class="seat"
          :class="{ me: game.mySide.value === HUMAN }"
          :title="game.seat1.value?.displayName || 'Ожидание…'"
        >
          <i class="s-dot you" />
          <div class="s-info">
            <b>{{ game.seat1.value?.displayName || 'Ожидание…' }}</b>
            <span>Голубые {{ game.mySide.value === HUMAN ? '· Вы' : 'шашки' }}</span>
          </div>
        </div>
        <div
          class="seat"
          :class="{ me: game.mySide.value !== HUMAN }"
          :title="game.seat2.value?.displayName || 'Свободное место…'"
        >
          <i class="s-dot bot" />
          <div class="s-info">
            <b>{{ game.seat2.value?.displayName || 'Свободное место…' }}</b>
            <span>Оранжевые {{ game.mySide.value !== HUMAN ? '· Вы' : 'шашки' }}</span>
          </div>
        </div>
      </div>

      <div class="room-actions">
        <button type="button" class="btn primary" @click="game.newGame(); close()">
          Новая партия
        </button>
        <button type="button" class="btn danger" @click="onLeaveRoom">
          Выйти к ИИ
        </button>
      </div>
    </div>

    <!-- Создание и поиск комнаты -->
    <div class="lobby-section">
      <h3>Быстрый старт</h3>
      <button
        type="button"
        class="btn primary full-btn"
        :disabled="loadingAction"
        @click="onQuickMatch"
      >
        ⚡ Быстрый поиск соперника (Quick Match)
      </button>

      <h3>Создать свою комнату</h3>
      <div class="input-row">
        <input
          v-model="customRoomInput"
          type="text"
          class="gh-input"
          placeholder="Свой код (или оставьте пустым)"
          maxlength="18"
          @keydown.enter="onCreateRoom"
        />
        <button type="button" class="btn" :disabled="loadingAction" @click="onCreateRoom">
          Создать
        </button>
      </div>

      <h3>Войти по коду комнаты</h3>
      <div class="input-row">
        <input
          v-model="joinCodeInput"
          type="text"
          class="gh-input"
          placeholder="Например: UGOL-1234 или main_room"
          maxlength="24"
          @keydown.enter="onJoinByCode()"
        />
        <button type="button" class="btn" :disabled="loadingAction" @click="onJoinByCode()">
          Войти
        </button>
      </div>

      <div class="preset-row">
        <span>Общая комната:</span>
        <button type="button" class="chip-btn" @click="onJoinByCode('main_room')">
          main_room
        </button>
      </div>
    </div>

    <div class="btns">
      <button class="btn" type="button" @click="close">Закрыть</button>
    </div>
  </BaseModal>
</template>

<style scoped>
.gh-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.gh-sub {
  margin: 2px 0 0 !important;
  font-size: 12px !important;
  color: var(--muted) !important;
}
.gh-user-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
}
.gh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
}
.gh-dot.auth {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.room-box {
  background: rgba(12, 18, 28, 0.85);
  border: 1px solid rgba(95, 209, 200, 0.35);
  border-radius: 16px;
  padding: 14px;
  margin-bottom: 14px;
}
.room-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.room-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--muted);
  font-weight: 700;
}
.room-code {
  font-size: 20px;
  font-weight: 800;
  color: #5fd1c8;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}
.btn-mini {
  appearance: none;
  cursor: pointer;
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid rgba(95, 209, 200, 0.4);
  background: rgba(95, 209, 200, 0.14);
  color: #e2e8f0;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}
.room-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.badge {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
}
.badge.playing {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}
.badge.host {
  background: rgba(250, 204, 21, 0.16);
  color: #fde047;
}

.seats {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 8px;
  margin-top: 10px;
}
.seat {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  min-height: 52px;
  padding: 9px 11px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  box-sizing: border-box;
}
.seat.me {
  border-color: rgba(127, 214, 255, 0.4);
  background: rgba(127, 214, 255, 0.08);
}
.s-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.s-dot.you {
  background: var(--you);
  box-shadow: 0 0 8px var(--you);
}
.s-dot.bot {
  background: var(--bot);
  box-shadow: 0 0 8px var(--bot);
}
.s-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.s-info b {
  display: block;
  font-size: 12.5px;
  line-height: 1.3;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.s-info span {
  display: block;
  font-size: 11px;
  line-height: 1.3;
  margin-top: 2px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}
.room-actions .btn {
  min-height: 40px;
  font-size: 13px;
  padding: 0 10px;
}
.btn.danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.lobby-section h3 {
  margin: 12px 0 5px;
}

.full-btn {
  width: 100%;
  margin-top: 4px;
}
.input-row {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.input-row .btn {
  flex: 0 0 auto;
  padding: 0 16px;
}
.gh-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(7, 10, 15, 0.75);
  color: #fff;
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  outline: none;
}
.gh-input:focus {
  border-color: var(--accent);
}
.preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.chip-btn {
  appearance: none;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.06);
  color: #7fd6ff;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
}
</style>

