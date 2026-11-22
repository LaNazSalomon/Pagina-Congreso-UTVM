<template>
  <section
    v-if="cargando || error || noticias.length"
    class="news-section"
    aria-labelledby="home-news-title"
  >
    <header class="news-heading">
      <div>
        <span class="news-kicker">Mantente al día</span>
        <h2 id="home-news-title">Noticias del congreso</h2>
      </div>
      <q-btn
        flat
        no-caps
        label="Ver todas las noticias"
        icon-right="east"
        :to="rutaListado"
        class="news-link"
      />
    </header>

    <div v-if="cargando" class="news-state" role="status">
      <q-spinner size="32px" aria-hidden="true" />
      <span>Cargando noticias…</span>
    </div>
    <div v-else-if="error" class="news-state" role="alert">
      <p>{{ error }}</p>
      <q-btn outline no-caps label="Reintentar" @click="reintentar" />
    </div>
    <div
      v-else-if="actual"
      class="news-carousel"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Noticias publicadas"
      tabindex="0"
      @mouseenter="sobreCarrusel = true"
      @mouseleave="sobreCarrusel = false"
      @focusin="conFoco = true"
      @focusout="salirFoco"
      @keydown.left.self.prevent="mover(-1)"
      @keydown.right.self.prevent="mover(1)"
    >
      <div v-touch-swipe.horizontal="deslizar">
        <article
          :key="actual.id"
          class="news-feature"
          :aria-label="`${indice + 1} de ${noticias.length}`"
        >
          <NoticiaPortada :url="actual.portada?.url" :titulo="actual.titulo" />
          <div class="news-feature__copy">
            <time :datetime="actual.fechaPublicacion" class="news-date">{{
              fechaNoticia(actual.fechaPublicacion)
            }}</time>
            <h3>{{ actual.titulo }}</h3>
            <q-btn
              unelevated
              no-caps
              label="Leer noticia"
              icon-right="arrow_forward"
              :to="{
                path: `/noticias/${actual.slug}`,
                query: rutaListado.query
              }"
              class="news-primary"
            />
          </div>
        </article>
      </div>

      <div v-if="noticias.length > 1" class="news-carousel__controls">
        <div class="news-carousel__position">
          <q-btn
            flat
            round
            icon="chevron_left"
            aria-label="Noticia anterior"
            @click="mover(-1)"
          />
          <span :aria-live="pausado ? 'polite' : 'off'" aria-atomic="true"
            >{{ indice + 1 }} de {{ noticias.length }}</span
          >
          <q-btn
            flat
            round
            icon="chevron_right"
            aria-label="Noticia siguiente"
            @click="mover(1)"
          />
        </div>
        <q-btn
          flat
          no-caps
          :icon="pausado ? 'play_arrow' : 'pause'"
          :label="pausado ? 'Reanudar' : 'Pausar'"
          :aria-label="
            pausado ? 'Reanudar avance automático' : 'Pausar avance automático'
          "
          @click="alternarPausa"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useNoticiasPublicas } from "@/composables/useNoticiasPublicas";
import { fechaNoticia } from "@/utils/noticias";
import NoticiaPortada from "./NoticiaPortada.vue";

const props = defineProps<{ congresoId?: string | undefined }>();
const { noticias, cargando, error, reintentar } = useNoticiasPublicas(
  () => props.congresoId
);
const indice = ref(0);
const actual = computed(() => noticias.value[indice.value]);
const rutaListado = computed(() => ({
  path: "/noticias",
  query: { congreso: props.congresoId }
}));
const pausado = ref(false);
const sobreCarrusel = ref(false);
const conFoco = ref(false);
const documentoVisible = ref(true);
let temporizador: ReturnType<typeof setInterval> | undefined;
let movimientoReducido: MediaQueryList | undefined;

function mover(pasos: number) {
  if (noticias.value.length < 2) return;
  pausado.value = true;
  indice.value =
    (indice.value + pasos + noticias.value.length) % noticias.value.length;
}

function deslizar({ direction }: { direction: string }) {
  mover(direction === "left" ? 1 : -1);
}

function alternarPausa() {
  pausado.value = !pausado.value;
  // Reanudar es una petición explícita, también al usar el botón con teclado.
  if (!pausado.value) conFoco.value = false;
}

function salirFoco(event: FocusEvent) {
  conFoco.value =
    event.currentTarget instanceof HTMLElement &&
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget);
}

function actualizarVisibilidad() {
  documentoVisible.value = !document.hidden;
}
function actualizarMovimiento() {
  if (movimientoReducido?.matches) pausado.value = true;
}

watch(noticias, () => {
  indice.value = 0;
});
watch([noticias, pausado, sobreCarrusel, conFoco, documentoVisible], () => {
  clearInterval(temporizador);
  if (
    noticias.value.length > 1 &&
    !pausado.value &&
    !sobreCarrusel.value &&
    !conFoco.value &&
    documentoVisible.value
  ) {
    temporizador = setInterval(() => {
      indice.value = (indice.value + 1) % noticias.value.length;
    }, 7000);
  }
});

onMounted(() => {
  movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)");
  actualizarMovimiento();
  actualizarVisibilidad();
  movimientoReducido.addEventListener("change", actualizarMovimiento);
  document.addEventListener("visibilitychange", actualizarVisibilidad);
});
onBeforeUnmount(() => {
  clearInterval(temporizador);
  movimientoReducido?.removeEventListener("change", actualizarMovimiento);
  document.removeEventListener("visibilitychange", actualizarVisibilidad);
});
</script>
