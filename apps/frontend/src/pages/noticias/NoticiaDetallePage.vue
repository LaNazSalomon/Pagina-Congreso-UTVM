<template>
  <q-page class="news-page">
    <div class="news-container news-container--article">
      <q-btn
        flat
        no-caps
        :to="rutaListado"
        icon="west"
        label="Volver a noticias"
        class="news-back"
      />
      <div v-if="cargando" class="news-state" role="status">
        <q-spinner size="36px" aria-hidden="true" />
        <span>Cargando noticia…</span>
      </div>
      <div v-else-if="error" class="news-state" role="alert">
        <q-icon
          :name="noEncontrada ? 'article' : 'cloud_off'"
          size="56px"
          aria-hidden="true"
        />
        <h1>{{
          noEncontrada
            ? "Noticia no disponible"
            : "No pudimos cargar la noticia"
        }}</h1>
        <p>{{
          noEncontrada
            ? "El enlace no existe o la noticia ya no está publicada."
            : "Inténtalo de nuevo en unos momentos."
        }}</p>
        <q-btn
          v-if="!noEncontrada"
          outline
          no-caps
          label="Reintentar"
          @click="intento++"
        />
        <q-btn
          v-else
          unelevated
          no-caps
          label="Ver noticias publicadas"
          :to="rutaListado"
          class="news-primary"
        />
      </div>
      <article v-else-if="noticia" class="news-article">
        <header class="news-page__heading">
          <span class="news-kicker">Noticias del congreso</span>
          <h1>{{ noticia.titulo }}</h1>
          <time :datetime="noticia.fechaPublicacion" class="news-date">{{
            fechaNoticia(noticia.fechaPublicacion)
          }}</time>
        </header>
        <NoticiaPortada :url="noticia.portada?.url" :titulo="noticia.titulo" />
        <div class="news-article__body">{{ noticia.cuerpo }}</div>
        <q-btn
          outline
          no-caps
          :to="rutaListado"
          icon="west"
          label="Ver más noticias"
          class="news-link"
        />
      </article>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import NoticiaPortada from "@/components/noticias/NoticiaPortada.vue";
import { contenidoOficialService } from "@/services/contenidoOficialService";
import type { NoticiaPublicaDetalle } from "@/types/contenido-oficial";
import { fechaNoticia } from "@/utils/noticias";

const route = useRoute();
const noticia = ref<NoticiaPublicaDetalle | null>(null);
const cargando = ref(false);
const error = ref(false);
const noEncontrada = ref(false);
const intento = ref(0);
const rutaListado = computed(() => ({
  path: "/noticias",
  query: {
    congreso:
      typeof route.query.congreso === "string"
        ? route.query.congreso
        : undefined,
    pagina:
      typeof route.query.pagina === "string" ? route.query.pagina : undefined
  }
}));

watch(
  [() => String((route.params as Record<string, unknown>).slug || ""), intento],
  async ([slug], _, onCleanup) => {
    let vigente = true;
    onCleanup(() => {
      vigente = false;
    });
    noticia.value = null;
    cargando.value = true;
    error.value = false;
    noEncontrada.value = false;
    try {
      const resultado = await contenidoOficialService.getNoticiaPublica(slug);
      if (vigente) noticia.value = resultado;
    } catch (err) {
      if (vigente) {
        error.value = true;
        noEncontrada.value =
          axios.isAxiosError(err) && err.response?.status === 404;
      }
    } finally {
      if (vigente) cargando.value = false;
    }
  },
  { immediate: true }
);
</script>
