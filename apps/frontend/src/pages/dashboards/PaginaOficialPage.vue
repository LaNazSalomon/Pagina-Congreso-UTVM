<template>
  <q-page class="hero-page pagina-oficial-page q-pa-md">
    <div class="row justify-between items-center q-gutter-md q-mb-lg">
      <div>
        <div class="text-h4 text-weight-bold">Página oficial</div>
        <div class="text-subtitle2 text-grey-7">
          Administra noticias, agenda, información general y banners.
        </div>
      </div>

      <div class="text-subtitle2">{{ selectedCongress?.nombre }}</div>
    </div>

    <StatePanel
      v-if="error"
      title="No se pudieron cargar los congresos"
      :description="error"
      icon="warning"
      tone="warning"
    />

    <q-card
      v-else-if="isRefreshing"
      class="dashboard-card content-shell q-pa-lg"
    >
      <q-skeleton type="text" width="35%" />
      <q-skeleton type="rect" height="280px" class="q-mt-md" />
    </q-card>

    <StatePanel
      v-else-if="!selectedCongress"
      title="Primero registra un congreso"
      description="La información de la página oficial debe pertenecer a una edición del congreso."
      icon="event_busy"
      tone="info"
    />

    <q-card v-else class="dashboard-card content-shell">
      <q-tabs
        v-model="activeTab"
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="content-tabs"
        narrow-indicator
      >
        <q-tab name="noticias" icon="newspaper" label="Noticias" />
        <q-tab name="agenda" icon="calendar_month" label="Agenda" />
        <q-tab name="informacion" icon="article" label="Información general" />
        <q-tab name="banners" icon="view_carousel" label="Banners" />
      </q-tabs>

      <q-separator />

      <q-tab-panels
        v-model="activeTab"
        animated
        keep-alive
        class="content-panels"
      >
        <q-tab-panel name="noticias">
          <NoticiasAdmin
            :congreso-id="selectedCongress.id"
            :congreso-nombre="selectedCongress.nombre"
          />
        </q-tab-panel>

        <q-tab-panel name="agenda">
          <AgendaAdmin
            :congreso-id="selectedCongress.id"
            :congreso-nombre="selectedCongress.nombre"
          />
        </q-tab-panel>

        <q-tab-panel name="informacion">
          <SeccionesAdmin
            :congreso-id="selectedCongress.id"
            :congreso-nombre="selectedCongress.nombre"
          />
        </q-tab-panel>

        <q-tab-panel name="banners">
          <BannersAdmin
            :congreso-id="selectedCongress.id"
            :congreso-nombre="selectedCongress.nombre"
          />
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";

import AgendaAdmin from "../../components/contenido/AgendaAdmin.vue";
import BannersAdmin from "../../components/contenido/BannersAdmin.vue";
import NoticiasAdmin from "../../components/contenido/NoticiasAdmin.vue";
import SeccionesAdmin from "../../components/contenido/SeccionesAdmin.vue";
import StatePanel from "../../components/feedback/StatePanel.vue";
import { useAdminCongreso } from "../../composables/useAdminCongreso";

const { congresos, selectedCongressId, selectedCongress, isRefreshing, error, load } = useAdminCongreso();
const route = useRoute();
const validTabs = ["noticias", "agenda", "informacion", "banners"];
const requestedTab =
  typeof route.query.tab === "string" && validTabs.includes(route.query.tab)
    ? route.query.tab
    : "noticias";
const activeTab = ref(requestedTab);

watch(
  () => route.query.tab,
  tab => {
    if (typeof tab === "string" && validTabs.includes(tab)) {
      activeTab.value = tab;
    }
  }
);

watch(
  () => route.query.congreso,
  congressId => {
    if (
      typeof congressId === "string" &&
      congresos.value.some(congreso => congreso.id === congressId)
    ) {
      selectedCongressId.value = congressId;
    }
  },
  { immediate: true }
);

watch(congresos, () => {
  const congressId = route.query.congreso;
  if (typeof congressId === "string" && congresos.value.some(item => item.id === congressId))
    selectedCongressId.value = congressId;
});
void load();
</script>

<style scoped>
.content-shell {
  overflow: hidden;
}

.content-tabs,
.content-panels {
  color: inherit;
  background: transparent;
}

.content-panels :deep(.q-tab-panel) {
  padding: 20px;
}
</style>
