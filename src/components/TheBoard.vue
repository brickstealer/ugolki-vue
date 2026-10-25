<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { BoardScene } from '@/three/BoardScene';
import { useGame } from '@/game/useGame';
import { sfx } from '@/composables/useSound';

const canvasEl = ref<HTMLCanvasElement | null>(null);
const game = useGame();
let scene: BoardScene | null = null;

function syncSelection(): void {
  scene?.showSelection(game.selected.value, game.movesByCell.value);
}

onMounted(() => {
  if (!canvasEl.value) return;
  scene = new BoardScene(canvasEl.value);
  scene.onTap = (cell) => game.tapCell(cell);
  scene.onSound = (kind, n) => {
    if (kind === 'hop') sfx.hop(n);
    else if (kind === 'step') sfx.step();
    else if (kind === 'land') sfx.land();
    else sfx.select();
  };
  game.attachAnimator(scene);
  scene.setBoard(game.board.value);
  syncSelection();
});

watch(() => game.board.value, (b) => scene?.setBoard(b));
watch(() => [game.selected.value, game.movesByCell.value], syncSelection);

onBeforeUnmount(() => {
  game.attachAnimator(null);
  scene?.dispose();
  scene = null;
});
</script>

<template>
  <canvas ref="canvasEl" class="board-canvas" />
</template>

<style scoped>
.board-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
</style>
