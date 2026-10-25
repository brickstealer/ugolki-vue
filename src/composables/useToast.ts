/** Одна всплывающая подсказка на всё приложение (singleton на refs). */
import { ref } from 'vue';

const message = ref('');
const visible = ref(false);
let timer: number | undefined;

export function useToast() {
  function show(text: string, ms = 2200): void {
    message.value = text;
    visible.value = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(() => {
      visible.value = false;
      timer = undefined;
    }, ms);
  }

  function hide(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    visible.value = false;
  }

  return { message, visible, show, hide };
}
