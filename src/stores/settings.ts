/** Пользовательские настройки: сложность и звук. Хранятся в localStorage. */
import { defineStore } from 'pinia';
import { LEVELS, type LevelId } from '@/core';

const STORAGE_KEY = 'ugolki.vue.settings';

export interface SettingsState {
  level: LevelId;
  sound: boolean;
}

function defaults(): SettingsState {
  return { level: 'normal', sound: true };
}

function load(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<SettingsState>;
    return {
      level: p.level && p.level in LEVELS ? p.level : 'normal',
      sound: p.sound !== false,
    };
  } catch {
    return defaults();
  }
}

function persist(state: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: state.level, sound: state.sound }));
  } catch {
    /* приватный режим — живём без сохранения */
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => load(),
  actions: {
    setLevel(level: LevelId) {
      this.level = level;
      persist(this.$state);
    },
    toggleSound() {
      this.sound = !this.sound;
      persist(this.$state);
    },
  },
});
