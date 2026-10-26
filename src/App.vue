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
import MultiplayerModal from '@/components/MultiplayerModal.vue';
import LeaderboardModal from '@/components/LeaderboardModal.vue';
import GameOverModal from '@/components/GameOverModal.vue';

const game = useGame();
const settings = useSettingsStore();
const toast = useToast();

const rulesOpen = ref(false);
const multiplayerOpen = ref(false);
const leaderboardOpen = ref(false);

// настройки звука → WebAudio-слой
watch(() => settings.sound, (v) => setSoundEnabled(v), { immediate: true });

/** Горячие клавиши: U — откат, H — подсказка, N — новая партия. */
function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  const k = e.key.toLowerCase();
  if (k === 'escape') {
    rulesOpen.value = false;
    multiplayerOpen.value = false;
    leaderboardOpen.value = false;
    return;
  }
  if (['u', 'г'].includes(k)) game.undo();
  if (['h', 'р'].includes(k)) void game.hint();
  if (['n', 'т'].includes(k)) game.newGame();
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  await game.initSession();
  if (game.mode.value === 'ai' && game.plies.value === 0) {
    setTimeout(() => toast.show('Коснись своей шашки, затем светлой точки', 3600), 700);
  }
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <TheBoard />
  <div class="vignette" />
  <TopBar
    @open-multiplayer="multiplayerOpen = true"
    @open-leaderboard="leaderboardOpen = true"
  />
  <BottomBar
    @open-rules="rulesOpen = true"
    @open-multiplayer="multiplayerOpen = true"
    @open-leaderboard="leaderboardOpen = true"
  />
  <ToastHost />
  <RulesModal v-model:open="rulesOpen" />
  <MultiplayerModal v-model:open="multiplayerOpen" />
  <LeaderboardModal v-model:open="leaderboardOpen" />
  <GameOverModal @open-leaderboard="leaderboardOpen = true" />
</template>
