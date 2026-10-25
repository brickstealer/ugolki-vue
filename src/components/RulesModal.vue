<script setup lang="ts">
import BaseModal from './BaseModal.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();
</script>

<template>
  <BaseModal :open="open" @close="emit('update:open', false)">
    <h2>Правила</h2>
    <p>Цель — перевести все свои шашки в <span class="k">угол соперника</span>.</p>

    <h3>Доска и расстановка</h3>
    <ul>
      <li>Доска <span class="k">9×9</span>, доступны все клетки.</li>
      <li>У тебя <span class="k you">9 голубых</span> шашек в правом нижнем углу, у ИИ <span class="k bot">9 оранжевых</span> — в левом верхнем.</li>
    </ul>

    <h3>Ход</h3>
    <ul>
      <li>Коснись своей шашки — появятся точки возможных ходов; коснись точки, чтобы сходить.</li>
      <li>Обычный ход: на любую соседнюю клетку (8 направлений), если она свободна.</li>
      <li>Прыжок: через <span class="k">одну</span> шашку (свою или чужую) на свободную клетку за ней. Цепочка прыжков за один ход — сколько угодно, но без повторных приземлений на одну клетку.</li>
      <li>Прыжки <span class="k">не</span> обязательны, шашки не бьются.</li>
    </ul>

    <h3>Победа</h3>
    <ul>
      <li>Все 9 твоих шашек в углу соперника — победа, и наоборот.</li>
      <li>Нет ходов — ход пропускается. Два пропуска подряд — ничья.</li>
      <li>После 260 полуходов (по 130 хода каждой стороне) побеждает тот, кто перевёл в чужой угол больше шашек; при равенстве — кто ближе к цели.</li>
    </ul>

    <div class="btns">
      <button class="btn primary" type="button" @click="emit('update:open', false)">Понятно</button>
    </div>
  </BaseModal>
</template>
