<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { LEVELS, LEVEL_IDS, type LevelId } from '@/core';
import { useGame } from '@/game/useGame';
import BaseModal from './BaseModal.vue';

const emit = defineEmits<{ 'open-leaderboard': [] }>();

const game = useGame();
const open = ref(false);
let timer: number | undefined;

const didWin = computed(() => game.winner.value !== null && game.winner.value === game.mySide.value);
const isDraw = computed(() => game.winner.value === null);

const title = computed(() =>
  didWin.value ? 'Победа!' : isDraw.value ? 'Ничья' : 'Поражение',
);
const titleStyle = computed(() => ({
  color: didWin.value ? '#6fe3d6' : isDraw.value ? '#c9d5e6' : '#ff9a68',
}));
const subtitle = computed(() => {
  const base =
    (game.reason.value ? game.reason.value + ' · ' : '') +
    'ходов: ' + game.plies.value +
    ' · мои в цели: ' + game.progressYou.value + '/9' +
    ' · соперник: ' + game.progressBot.value + '/9';
  if (game.mode.value === 'online') {
    return base + ` · комната ${game.roomCode.value ?? ''}`;
  }
  return base + ' · сложность: ' + LEVELS[game.level.value].label;
});

watch(
  () => game.over.value,
  (isOver) => {
    if (timer !== undefined) clearTimeout(timer);
    if (isOver) {
      timer = window.setTimeout(() => {
        if (game.over.value) open.value = true;
      }, 520);
    } else {
      open.value = false;
    }
  },
);

function pickLevel(level: LevelId): void {
  game.setLevel(level);
}

const onKey = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') open.value = false;
};
window.addEventListener('keydown', onKey);
onBeforeUnmount(() => {
  if (timer !== undefined) clearTimeout(timer);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <BaseModal :open="open" @close="open = false">
    <div class="res" :style="titleStyle">{{ title }}</div>
    <div class="sub">{{ subtitle }}</div>

    <div class="reward-bar">
      <div class="rw-item">
        <span>Награда GameHub</span>
        <b>+{{ game.lastEarnedCoins.value }} 🪙</b>
      </div>
      <div class="rw-item">
        <span>Очки рейтинга</span>
        <b>{{ game.lastMatchScore.value }} 🏆</b>
      </div>
    </div>

    <template v-if="game.mode.value === 'ai'">
      <h3>Сложность</h3>
      <div class="lvls">
        <button
          v-for="id in LEVEL_IDS"
          :key="id"
          type="button"
          :class="{ on: game.level.value === id }"
          @click="pickLevel(id)"
        >
          {{ LEVELS[id].label }}<span>{{ LEVELS[id].desc }}</span>
        </button>
      </div>
    </template>

    <div class="btns">
      <button class="btn" type="button" @click="open = false; emit('open-leaderboard')">
        Рекорды 🏆
      </button>
      <button class="btn" type="button" @click="open = false">Досмотреть</button>
      <button class="btn primary" type="button" @click="game.newGame()">Ещё раз</button>
    </div>
  </BaseModal>
</template>

<style scoped>
.reward-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}
.rw-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 9px 12px;
}
.rw-item span {
  display: block;
  font-size: 11px;
  color: var(--muted);
}
.rw-item b {
  display: block;
  margin-top: 2px;
  font-size: 15px;
  color: #fde047;
  font-variant-numeric: tabular-nums;
}
</style>
