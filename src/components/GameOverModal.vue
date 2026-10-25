<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { BOT, HUMAN, LEVELS, LEVEL_IDS, type LevelId } from '@/core';
import { useGame } from '@/game/useGame';
import BaseModal from './BaseModal.vue';

const game = useGame();
const open = ref(false);
let timer: number | undefined;

const title = computed(() =>
  game.winner.value === HUMAN ? 'Победа!' : game.winner.value === BOT ? 'Поражение' : 'Ничья',
);
const titleStyle = computed(() => ({
  color: game.winner.value === HUMAN ? '#6fe3d6' : game.winner.value === BOT ? '#ff9a68' : '#c9d5e6',
}));
const subtitle = computed(() =>
  (game.reason.value ? game.reason.value + ' · ' : '') +
  'ходов: ' + game.plies.value +
  ' · мои в углу ИИ: ' + game.progressYou.value + '/9' +
  ' · ИИ в моём: ' + game.progressBot.value + '/9' +
  ' · сложность: ' + LEVELS[game.level.value].label,
);

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
  game.setLevel(level); // стартует новую партию — модалка закроется сама
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

    <div class="btns">
      <button class="btn" type="button" @click="open = false">Досмотреть</button>
      <button class="btn primary" type="button" @click="game.newGame()">Ещё раз</button>
    </div>
  </BaseModal>
</template>
