<template>
  <q-img v-if="url" :src="url" :alt="titulo" :ratio="16 / 9" class="news-cover">
    <template #error>
      <div class="news-cover__fallback absolute-full">
        <q-icon name="newspaper" size="64px" aria-hidden="true" />
        <span>Noticias del congreso</span>
      </div>
    </template>
  </q-img>
  <div
    v-else
    class="news-cover news-cover__fallback"
    role="img"
    :aria-label="titulo"
  >
    <q-icon name="newspaper" size="64px" aria-hidden="true" />
    <span>Noticias del congreso</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ url?: string | null | undefined; titulo: string }>();
</script>
