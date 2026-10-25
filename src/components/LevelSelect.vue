<script setup lang="ts">
import { LEVELS, LEVEL_IDS, type LevelId } from '@/core';

defineProps<{ modelValue: LevelId }>();
const emit = defineEmits<{ pick: [level: LevelId] }>();
</script>

<template>
  <nav class="seg">
    <button
      v-for="id in LEVEL_IDS"
      :key="id"
      :class="{ on: modelValue === id }"
      type="button"
      @click="emit('pick', id)"
    >
      {{ LEVELS[id].label }}
    </button>
  </nav>
</template>
