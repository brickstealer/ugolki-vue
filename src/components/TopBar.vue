<script setup lang="ts">
import { computed } from 'vue';
import { BOT, HUMAN, type LevelId } from '@/core';
import { useGame } from '@/game/useGame';
import { usePlatform } from '@/platform/gamehub';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import LevelSelect from './LevelSelect.vue';

const emit = defineEmits<{
  'open-multiplayer': [];
  'open-leaderboard': [];
}>();

const game = useGame();
const platform = usePlatform();
const settings = useSettingsStore();
const toast = useToast();

const statusText = computed(() => {
  if (game.over.value) return 'Партия окончена';
  if (game.mode.value === 'online') {
    if (game.roomStatus.value === 'connecting') return 'Подключение к комнате…';
    if (game.roomStatus.value === 'waiting' || !game.seat2.value) {
      return `Ожидание соперника · код ${game.roomCode.value ?? ''}`;
    }
    if (game.turn.value === game.mySide.value) {
      return game.busy.value
        ? 'Ход…'
        : `Твой ход (${game.mySide.value === HUMAN ? 'голубые' : 'оранжевые'})`;
    }
    return `Ход соперника (${game.opponentName.value})…`;
  }
  if (game.turn.value === BOT) return game.busy.value ? 'ИИ думает…' : 'ИИ ходит…';
  return game.busy.value ? 'Ход…' : 'Твой ход';
});

const opponentTurn = computed(() => {
  if (game.over.value) return false;
  if (game.mode.value === 'online') {
    return game.roomStatus.value !== 'playing' || game.turn.value !== game.mySide.value;
  }
  return game.turn.value === BOT;
});

function onPick(level: LevelId): void {
  game.setLevel(level);
}

async function copyCode(): Promise<void> {
  const code = game.roomCode.value;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast.show(`Код комнаты ${code} скопирован!`);
  } catch {
    toast.show(`Код комнаты: ${code}`);
  }
}
</script>

<template>
  <header class="hud">
    <div class="row">
      <div class="brand pill"><i /> Уголки <b>GameHub</b></div>

      <LevelSelect
        v-if="game.mode.value === 'ai'"
        :model-value="settings.level"
        class="pill"
        @pick="onPick"
      />

      <button
        v-else
        type="button"
        class="room-pill pill"
        title="Нажмите, чтобы скопировать код комнаты"
        @click="copyCode"
      >
        <span class="live-dot" />
        <span>Комната: <b>{{ game.roomCode.value }}</b></span>
        <span v-if="game.isHost.value" class="host-tag">👑</span>
      </button>

      <button
        type="button"
        class="action-pill pill"
        :class="{ active: game.mode.value === 'online' }"
        @click="emit('open-multiplayer')"
      >
        <span class="online-icon" />
        <span>{{ game.mode.value === 'online' ? 'Лобби' : 'Онлайн 1×1' }}</span>
      </button>

      <button
        type="button"
        class="action-pill pill lb-btn"
        title="Таблица лидеров и профиль GameHub"
        @click="emit('open-leaderboard')"
      >
        <span>🏆 {{ platform.coins.value }}</span>
      </button>
    </div>

    <div class="status pill" :class="{ bot: opponentTurn }">
      <span class="dot" />
      <span>{{ statusText }}</span>
    </div>
  </header>
</template>

<style scoped>
.status .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--you);
  box-shadow: 0 0 10px var(--you);
  animation: pulse 1.8s infinite;
}
.status.bot .dot {
  background: var(--bot);
  box-shadow: 0 0 10px var(--bot);
}

.action-pill,
.room-pill {
  appearance: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #e2e8f0;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 12px;
  min-height: 36px;
  transition: 0.16s;
}
.action-pill:active,
.room-pill:active {
  transform: scale(0.96);
}
.action-pill.active {
  border-color: rgba(95, 209, 200, 0.55);
  background: rgba(20, 42, 48, 0.82);
  color: #5fd1c8;
}
.online-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5fd1c8;
  box-shadow: 0 0 8px #5fd1c8;
}
.lb-btn {
  color: #fde047;
}
.room-pill b {
  color: #5fd1c8;
  letter-spacing: 0.04em;
}
.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}
.host-tag {
  font-size: 11px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
