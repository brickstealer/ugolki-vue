<script setup lang="ts">
import { watch } from 'vue';
import { usePlatform, type LeaderboardEntry } from '@/platform/gamehub';
import BaseModal from './BaseModal.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const platform = usePlatform();

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void platform.fetchLeaderboard();
    }
  },
);

function close(): void {
  emit('update:open', false);
}

function entryName(e: LeaderboardEntry, idx: number): string {
  return e.displayName || e.playerName || e.name || e.playerId || `Игрок #${idx + 1}`;
}

function entryScore(e: LeaderboardEntry): number {
  return e.score ?? e.value ?? 0;
}

function isMyEntry(e: LeaderboardEntry): boolean {
  return Boolean(e.playerId && e.playerId === platform.user.value.playerId);
}
</script>

<template>
  <BaseModal :open="open" @close="close">
    <div class="lb-head">
      <div>
        <h2>Таблица лидеров</h2>
        <p class="lb-sub">GameHub Leaderboards &amp; Cloud Save</p>
      </div>
      <div class="coins-pill">🪙 {{ platform.coins.value }}</div>
    </div>

    <!-- Персональная статистика из облачного сохранения (State API) -->
    <div class="stats-grid">
      <div class="st-box">
        <span>Лучший счёт</span>
        <b>{{ platform.bestScore.value }}</b>
      </div>
      <div class="st-box">
        <span>Побед</span>
        <b>{{ platform.wins.value }}</b>
      </div>
      <div class="st-box">
        <span>Партий</span>
        <b>{{ platform.gamesPlayed.value }}</b>
      </div>
    </div>

    <h3>Топ-10 игроков (highscores)</h3>

    <div v-if="platform.leaderboardLoading.value" class="lb-empty">
      Загрузка таблицы рекордов…
    </div>
    <div v-else-if="!platform.leaderboardEntries.value.length" class="lb-empty">
      Пока нет записей. Одержите победу, чтобы занять 1-е место!
    </div>
    <div v-else class="lb-list">
      <div
        v-for="(entry, i) in platform.leaderboardEntries.value"
        :key="entry.playerId || i"
        class="lb-row"
        :class="{ me: isMyEntry(entry) }"
      >
        <span class="lb-rank" :class="'r' + (entry.rank ?? i + 1)">
          #{{ entry.rank ?? i + 1 }}
        </span>
        <span class="lb-name">
          {{ entryName(entry, i) }}
          <em v-if="isMyEntry(entry)">(Вы)</em>
        </span>
        <b class="lb-score">{{ entryScore(entry) }}</b>
      </div>
    </div>

    <div
      v-if="
        platform.playerLeaderboardEntry.value &&
        !platform.leaderboardEntries.value.some((e) => isMyEntry(e))
      "
      class="my-rank-footer"
    >
      Ваше место: <b>#{{ platform.playerLeaderboardEntry.value.rank ?? '—' }}</b> · Счёт:
      <b>{{ entryScore(platform.playerLeaderboardEntry.value) }}</b>
    </div>

    <div class="btns">
      <button class="btn" type="button" @click="platform.fetchLeaderboard()">Обновить</button>
      <button class="btn primary" type="button" @click="close">Готово</button>
    </div>
  </BaseModal>
</template>

<style scoped>
.lb-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.lb-sub {
  margin: 2px 0 0 !important;
  font-size: 12px !important;
  color: var(--muted) !important;
}
.coins-pill {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.14);
  border: 1px solid rgba(250, 204, 21, 0.35);
  color: #fde047;
  font-weight: 800;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.st-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 9px 10px;
  text-align: center;
}
.st-box span {
  display: block;
  font-size: 10.5px;
  color: var(--muted);
}
.st-box b {
  display: block;
  margin-top: 2px;
  font-size: 16px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.lb-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  max-height: 250px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
}
.lb-list::-webkit-scrollbar {
  width: 5px;
}
.lb-list::-webkit-scrollbar-track {
  background: transparent;
}
.lb-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.16);
  border-radius: 999px;
}
.lb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  font-size: 13px;
}
.lb-row.me {
  background: rgba(95, 209, 200, 0.14);
  border-color: rgba(95, 209, 200, 0.45);
}
.lb-rank {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  color: var(--muted);
}
.lb-rank.r1 {
  color: #fde047;
}
.lb-rank.r2 {
  color: #e2e8f0;
}
.lb-rank.r3 {
  color: #fdba74;
}
.lb-name {
  flex: 1;
  color: #e2e8f0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lb-name em {
  font-style: normal;
  color: #5fd1c8;
  font-size: 11px;
  margin-left: 4px;
}
.lb-score {
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.lb-empty {
  padding: 20px 12px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
.my-rank-footer {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(127, 214, 255, 0.08);
  font-size: 12px;
  color: #cbd5e1;
  text-align: center;
}
</style>

