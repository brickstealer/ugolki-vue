<script setup lang="ts">
defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div v-if="open" class="modal" @pointerdown.self="emit('close')">
    <div class="card">
      <slot />
    </div>
  </div>
</template>
