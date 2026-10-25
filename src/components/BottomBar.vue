<script setup lang="ts">
import { computed } from 'vue';
import { HUMAN } from '@/core';
import { useGame } from '@/game/useGame';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';

const game = useGame();
const settings = useSettingsStore();
const toast = useToast();

const emit = defineEmits<{ 'open-rules': [] }>();

const canUndo = computed(() => !game.busy.value && game.historyLength.value > 0);
const canHint = computed(() => !game.over.value && !game.busy.value);

function toggleSound(): void {
  settings.toggleSound();
  toast.show(settings.sound ? 'Звук включён' : 'Звук выключен');
}

function newGame(): void {
  game.newGame();
  toast.show('Новая партия · первым ходит ' + (game.firstMove.value === HUMAN ? 'ты' : 'ИИ'), 2600);
}
</script>

<template>
  <footer class="hud hud-bottom">
    <div class="stats">
      <div class="stat pill you"><i /><b>{{ game.progressYou.value }}/9</b> мой прогресс</div>
      <div class="stat pill mid"><b>{{ game.plies.value }}</b> ходов</div>
      <div class="stat pill bot"><i /><b>{{ game.progressBot.value }}/9</b> прогресс ИИ</div>
    </div>
    <div class="bar">
      <button type="button" title="Ход назад" aria-label="Ход назад" :disabled="!canUndo" @click="game.undo()">
        <svg viewBox="0 0 24 24"><path d="M4 12h11a4.5 4.5 0 0 1 0 9H9" /><path d="M8 8l-4 4 4 4" /></svg>
      </button>
      <button type="button" title="Подсказка" aria-label="Подсказка" :disabled="!canHint" @click="game.hint()">
        <svg viewBox="0 0 24 24"><path d="M12 3l2.1 5.5L20 10l-5.9 1.5L12 17l-2.1-5.5L4 10l5.9-1.5z" /></svg>
      </button>
      <button type="button" title="Новая игра" aria-label="Новая игра" @click="newGame">
        <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></svg>
      </button>
      <button type="button" title="Звук" aria-label="Звук" :class="{ off: !settings.sound }" @click="toggleSound">
        <svg viewBox="0 0 24 24"><path d="M5 9.5h3L12.5 6v12L8 14.5H5z" /><path d="M16 9.5a4 4 0 0 1 0 5" /></svg>
      </button>
      <button type="button" title="Правила" aria-label="Правила" @click="emit('open-rules')">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2-2.5 3.6" /><path d="M12 17.2h.01" /></svg>
      </button>
    </div>
  </footer>
</template>
