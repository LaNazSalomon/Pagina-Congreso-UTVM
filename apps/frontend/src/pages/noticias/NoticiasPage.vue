<template>
  <q-page class="news-page">
    <div class="news-container">
      <q-btn
        flat
        no-caps
        to="/"
        icon="west"
        label="Volver al inicio"
        class="news-back"
      />
      <header class="news-page__heading">
        <span class="news-kicker">Actualidad y avisos</span>
        <h1>Noticias del congreso</h1>
        <p v-if="congreso">{{ congreso.nombre }}</p>
        <p>Entérate de las novedades, actividades y anuncios del congreso.</p>
      </header>

      <div v-if="cargando" class="news-state" role="status">
        <q-spinner size="36px" aria-hidden="true" />
        <span>Cargando noticias…</span>
      </div>
      <div v-else-if="error" class="news-state" role="alert">
        <q-icon name="cloud_off" size="48px" aria-hidden="true" />
        <p>{{ error }}</p>
        <q-btn outline no-caps label="Reintentar" @click="reintentar" />
      </div>
      <div v-else-if="!noticias.length" class="news-state">
        <q-icon name="newspaper" size="56px" aria-hidden="true" />
        <h2>Aún no hay noticias publicadas</h2>
        <p>Vuelve pronto para conocer las novedades del congreso.</p>
      </div>
      <template v-else>
        <p ref="resumen" class="news-results" tabindex="-1" role="status">
          Mostrando {{ (pagina - 1) * POR_PAGINA + 1 }}–{{
            Math.min(pagina * POR_PAGINA, noticias.length)
          }}
          de {{ noticias.length }} noticias
        </p>
        <div class="news-grid">
          <article
            v-for="noticia in visibles"
            :key="noticia.id"
            class="news-card"
          >
            <router-link
              :to="rutaNoticia(noticia.slug)"
              class="news-card__image"
              tabindex="-1"
              aria-hidden="true"
            >
              <NoticiaPortada
                :url="noticia.portada?.url"
                :titulo="noticia.titulo"
              />
            </router-link>
            <div class="news-card__body">
              <time :datetime="noticia.fechaPublicacion" class="news-date">{{
                fechaNoticia(noticia.fechaPublicacion)
              }}</time>
              <h2
                ><router-link :to="rutaNoticia(noticia.slug)">{{
                  noticia.titulo
                }}</router-link></h2
              >
              <q-btn
                flat
                no-caps
                label="Leer noticia"
                icon-right="east"
                :to="rutaNoticia(noticia.slug)"
                class="news-link news-card__read"
              />
            </div>
          </article>
        </div>
        <nav
          v-if="totalPaginas > 1"
          aria-label="Páginas de noticias"
          class="news-pagination"
        >
          <q-pagination
            :model-value="pagina"
            :max="totalPaginas"
            :max-pages="5"
            direction-links
            boundary-links
            color="positive"
            text-color="white"
            active-text-color="black"
            :boundary-numbers="false"
            @update:model-value="cambiarPagina"
          />
        </nav>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import NoticiaPortada from "@/components/noticias/NoticiaPortada.vue";
import { useNoticiasPublicas } from "@/composables/useNoticiasPublicas";
import { fechaNoticia } from "@/utils/noticias";

const route = useRoute();
const router = useRouter();
const POR_PAGINA = 6;
const congresoId = computed(() =>
  typeof route.query.congreso === "string" ? route.query.congreso : undefined
);
const { noticias, congreso, cargando, error, reintentar } = useNoticiasPublicas(
  congresoId,
  true
);
const resumen = ref<HTMLElement | null>(null);
const totalPaginas = computed(() =>
  Math.max(1, Math.ceil(noticias.value.length / POR_PAGINA))
);
const pagina = computed(() => {
  const solicitada = Number(route.query.pagina);
  return Number.isSafeInteger(solicitada) && solicitada > 0
    ? Math.min(solicitada, totalPaginas.value)
    : 1;
});
const visibles = computed(() =>
  noticias.value.slice(
    (pagina.value - 1) * POR_PAGINA,
    pagina.value * POR_PAGINA
  )
);

function rutaNoticia(slug: string) {
  return {
    path: `/noticias/${slug}`,
    query: {
      congreso: congreso.value?.id,
      pagina: pagina.value > 1 ? String(pagina.value) : undefined
    }
  };
}

async function cambiarPagina(valor: number) {
  await router.push({
    path: "/noticias",
    query: {
      congreso: congresoId.value,
      pagina: valor > 1 ? String(valor) : undefined
    }
  });
  await nextTick();
  resumen.value?.focus({ preventScroll: true });
  resumen.value?.scrollIntoView({ behavior: "instant", block: "start" });
}
</script>
