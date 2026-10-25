<script setup lang="ts">
import { computed } from 'vue';
import { BOT, type LevelId } from '@/core';
import { useGame } from '@/game/useGame';
import { useSettingsStore } from '@/stores/settings';
import LevelSelect from './LevelSelect.vue';

const game = useGame();
const settings = useSettingsStore();

const statusText = computed(() => {
  if (game.over.value) return 'Партия окончена';
  if (game.turn.value === BOT) return game.busy.value ? 'ИИ думает…' : 'ИИ ходит…';
  return game.busy.value ? 'Ход…' : 'Твой ход';
});

const botThinking = computed(() => game.turn.value === BOT && !game.over.value);

function onPick(level: LevelId): void {
  game.setLevel(level);
}
</script>

<template>
  <header class="hud">
    <div class="row">
      <div class="brand pill"><i /> Уголки <b>Vue</b></div>
      <LevelSelect :model-value="settings.level" class="pill" @pick="onPick" />
    </div>
    <div class="status pill" :class="{ bot: botThinking }">
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
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
