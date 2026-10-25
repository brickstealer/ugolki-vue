import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // './' — абсолютные пути к ассета не зависят от места размещения:
  // работает и в корне GitHub Pages, и в подпапке вида /ugolki-vue/
  base: './',
  plugins: [vue()],
  // воркер движка — ES-модуль, чтобы импортировать ядро правил напрямую
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { host: true },
  build: {
    rollupOptions: {
      output: {
        // three тяжёлый и меняется редко — отдельным кэшируемым чанком
        manualChunks: {
          three: ['three'],
          vendor: ['vue', 'pinia'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
