<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useGame } from '@/game/useGame';
import { useSettingsStore } from '@/stores/settings';
import { useToast } from '@/composables/useToast';
import { setSoundEnabled } from '@/composables/useSound';
import TheBoard from '@/components/TheBoard.vue';
import TopBar from '@/components/TopBar.vue';
import BottomBar from '@/components/BottomBar.vue';
import ToastHost from '@/components/ToastHost.vue';
import RulesModal from '@/components/RulesModal.vue';
import GameOverModal from '@/components/GameOverModal.vue';

const game = useGame();
const settings = useSettingsStore();
const toast = useToast();

const rulesOpen = ref(false);

// настройки звука → WebAudio-слой
watch(() => settings.sound, (v) => setSoundEnabled(v), { immediate: true });

/** Горячие клавиши, как в оригинале: U — откат, H — подсказка, N — новая партия. */
function onKey(e: KeyboardEvent): void {
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    rulesOpen.value = false;
    return;
  }
  if (['u', 'г'].includes(k)) game.undo();
  if (['h', 'р'].includes(k)) void game.hint();
  if (['n', 'т'].includes(k)) game.newGame();
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  game.newGame();
  game.busy.value = false;
  setTimeout(() => toast.show('Коснись своей шашки, затем светлой точки', 3600), 700);
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <TheBoard />
  <div class="vignette" />
  <TopBar />
  <BottomBar @open-rules="rulesOpen = true" />
  <ToastHost />
  <RulesModal v-model:open="rulesOpen" />
  <GameOverModal />
</template>
