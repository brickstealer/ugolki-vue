<script setup lang="ts">
import { useToast } from '@/composables/useToast';

const toast = useToast();
</script>

<template>
  <div class="toast" :class="{ show: toast.visible.value }">{{ toast.message.value }}</div>
</template>
