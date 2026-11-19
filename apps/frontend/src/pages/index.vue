<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="app-header">
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          @click="toggleLeftDrawer"
        />

        <q-toolbar-title class="text-h6 ellipsis">
          <q-btn-dropdown
            flat
            no-caps
            class="admin-congress-button"
            :label="selectedCongress?.nombre || 'Seleccionar congreso'"
            :aria-label="`Congreso seleccionado: ${selectedCongress?.nombre || 'ninguno'}. Cambiar congreso`"
            :disable="isRefreshing || sortedCongresses.length === 0"
          >
            <q-list class="admin-congress-menu">
              <q-item
                v-for="congreso in sortedCongresses"
                :key="congreso.id"
                v-close-popup
                clickable
                :active="congreso.id === selectedCongressId"
                @click="selectedCongressId = congreso.id"
              >
                <q-item-section>
                  <q-item-label>{{ congreso.nombre }}</q-item-label>
                  <q-item-label caption>{{ congreso.fechaInicio?.slice(0, 10) }} – {{ congreso.fechaFin?.slice(0, 10) }}</q-item-label>
                </q-item-section>
                <q-item-section v-if="congreso.id === selectedCongressId" side>
                  <q-icon name="check" color="primary" />
                </q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
        </q-toolbar-title>
        <q-btn
          flat
          dense
          round
          icon="notifications"
          class="admin-alert-button"
          :aria-label="`${pagosPendientes.length} pagos pendientes de revisión`"
        >
          <q-badge v-if="pagosPendientes.length" floating rounded color="orange" text-color="dark">
            {{ pagosPendientes.length > 99 ? "99+" : pagosPendientes.length }}
          </q-badge>
          <q-menu class="admin-alert-menu" :dark="!isLight" max-height="70vh">
            <q-list>
              <q-item-label header class="admin-alert-heading">
                <q-icon name="payments" size="20px" />
                Pagos por validar · {{ selectedCongress?.nombre || "Congreso" }}
              </q-item-label>
              <q-item v-if="alertasCargando && !alertasCargadas">
                <q-item-section>Cargando avisos...</q-item-section>
              </q-item>
              <q-item v-else-if="alertasError">
                <q-item-section>{{ alertasError }}</q-item-section>
                <q-item-section side>
                  <q-btn flat dense icon="refresh" aria-label="Reintentar" @click="cargarAlertas" />
                </q-item-section>
              </q-item>
              <q-item v-else-if="!pagosPendientes.length">
                <q-item-section>No hay pagos pendientes de revisión.</q-item-section>
              </q-item>
              <q-item
                v-for="aviso in pagosPendientes"
                :key="aviso.clave"
                v-close-popup
                clickable
                :to="aviso.ruta"
                class="admin-alert-item"
              >
                <q-item-section avatar><q-icon name="receipt_long" color="orange" /></q-item-section>
                <q-item-section>
                  <q-item-label>{{ aviso.nombre }}</q-item-label>
                  <q-item-label caption>{{ aviso.tipo }} · {{ fechaAviso(aviso.fecha) }}</q-item-label>
                </q-item-section>
                <q-item-section v-if="aviso.comprobanteId" side>
                  <q-btn
                    flat dense round icon="open_in_new"
                    aria-label="Ver comprobante"
                    @click.stop="abrirComprobante(aviso.comprobanteId)"
                  />
                </q-item-section>
              </q-item>
              <q-separator />
              <q-item v-close-popup clickable to="/participantes?tab=externos">
                <q-item-section>Ir a Participantes</q-item-section>
                <q-item-section side><q-icon name="arrow_forward" /></q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
        <span class="admin-user-name q-mr-sm gt-xs">{{ usuarioPersonal?.nombre }}</span>
        <q-btn flat no-caps icon="logout" label="Salir" @click="cerrarSesion" />

        <q-btn
          flat
          dense
          round
          :icon="isLight ? 'dark_mode' : 'light_mode'"
          :aria-label="isLight ? 'Activar modo oscuro' : 'Activar modo claro'"
          @click="toggleTheme"
        />
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
      class="app-drawer"
    >
      <q-list padding>
        <q-item-label header class="drawer-title">
          Menú de Administrador
        </q-item-label>

        <EssentialLink
          v-for="link in linksList"
          :key="link.label"
          v-bind="link"
        />
      </q-list>
    </q-drawer>

    <q-page-container class="page-content">
      <q-banner
        v-if="usuarioPersonal && !usuarioPersonal.contrasenaConfigurada"
        class="bg-amber-1 text-dark"
      >
        El personal ahora entra con contraseña. Tu cuenta y permisos se
        conservan.
        <template #action
          ><q-btn
            flat
            no-caps
            label="Configurar mi contraseña"
            to="/personal/acceso"
        /></template>
      </q-banner>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useQuasar } from "quasar";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/services/api";
import { abrirComprobante } from "@/services/comprobanteService";
import { obtenerPagosPendientes } from "@/utils/pagosPendientes";
import { pagosAdminRevision } from "@/composables/useParticipantesAdmin";
import type { ParticipanteExterno, RegistroNsu } from "@/types";
import {
  usuarioPersonal,
  salirPersonal,
  errorPersonal
} from "../services/personalService";
import EssentialLink, {
  type EssentialLinkProps
} from "@/components/EssentialLink.vue";
import { useThemeMode } from "@/composables/useThemeMode";
import { useAdminCongreso } from "@/composables/useAdminCongreso";

const { isLight, toggleTheme } = useThemeMode();
const $q = useQuasar();
const router = useRouter();
const route = useRoute();
const { sortedCongresses, selectedCongressId, selectedCongress, isRefreshing, load } = useAdminCongreso();
const registrosNsu = ref<RegistroNsu[]>([]);
const registrosExternos = ref<ParticipanteExterno[]>([]);
const alertasCargando = ref(false);
const alertasCargadas = ref(false);
const alertasError = ref("");
const pagosPendientes = computed(() =>
  obtenerPagosPendientes(registrosNsu.value, registrosExternos.value, selectedCongressId.value)
);
let temporizadorAlertas: ReturnType<typeof setInterval> | undefined;
let recargarAlertasDespues = false;

async function cargarAlertas() {
  if (alertasCargando.value) {
    recargarAlertasDespues = true;
    return;
  }
  alertasCargando.value = true;
  alertasError.value = "";
  try {
    const [nsuResponse, externosResponse] = await Promise.all([
      api.get<RegistroNsu[]>("registro-nsu"),
      api.get<ParticipanteExterno[]>("externos")
    ]);
    registrosNsu.value = nsuResponse.data;
    registrosExternos.value = externosResponse.data;
    alertasCargadas.value = true;
  } catch {
    alertasError.value = "No se pudieron consultar los pagos. Intenta de nuevo.";
  } finally {
    alertasCargando.value = false;
    if (recargarAlertasDespues) {
      recargarAlertasDespues = false;
      void cargarAlertas();
    }
  }
}

function actualizarAlVolver() {
  if (document.visibilityState === "visible") void cargarAlertas();
}

function fechaAviso(fecha: string) {
  const valor = new Date(fecha);
  return Number.isNaN(valor.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(valor);
}

onMounted(() => {
  void load();
  void cargarAlertas();
  temporizadorAlertas = setInterval(actualizarAlVolver, 60_000);
  document.addEventListener("visibilitychange", actualizarAlVolver);
});
onBeforeUnmount(() => {
  if (temporizadorAlertas) clearInterval(temporizadorAlertas);
  document.removeEventListener("visibilitychange", actualizarAlVolver);
});
watch(() => route.fullPath, () => void cargarAlertas());
watch(pagosAdminRevision, () => void cargarAlertas());
async function cerrarSesion() {
  try {
    await salirPersonal();
    await router.replace("/personal/acceso");
  } catch (error) {
    $q.notify({ type: "negative", message: errorPersonal(error) });
  }
}

const linksList: EssentialLinkProps[] = [
  {
    label: "Usuarios y roles",
    caption: "Cuentas del personal",
    icon: "admin_panel_settings",
    link: "/admin/usuarios"
  },
  {
    label: "Dashboard de administrador",
    caption: "Resumen general",
    icon: "dashboard",
    link: "/admin/dashboard"
  },
  {
    label: "Página principal",
    caption: "Ir al sitio público",
    icon: "home",
    link: "/"
  },
  {
    label: "Participantes",
    caption: "Administración y validación",
    icon: "groups",
    link: "/participantes"
  },
  {
    label: "Conferencias",
    caption: "Gestión de conferencias",
    icon: "campaign",
    link: "/conferencias"
  },
  {
    label: "Congresos",
    caption: "Ediciones y periodos",
    icon: "event_available",
    link: "/congresos"
  },
  {
    label: "Pagos",
    caption: "Tarifas y datos de pago",
    icon: "payments",
    link: "/pagos"
  },
  {
    label: "Ubicaciones",
    caption: "Espacios y capacidades",
    icon: "meeting_room",
    link: "/ubicaciones"
  },
  {
    label: "Talleres",
    caption: "Gestión de talleres",
    icon: "build",
    link: "/talleres"
  },
  {
    label: "Ponentes, panelistas y evaluadores",
    caption: "Gestión de perfiles de actividades",
    icon: "record_voice_over",
    link: "/ponentes"
  },
  {
    label: "Hackatón",
    caption: "Equipos, resultados y lotes",
    icon: "emoji_events",
    link: "/hackatones"
  },
  {
    label: "Reconocimientos",
    caption: "Emisión para ponentes y panelistas",
    icon: "workspace_premium",
    link: "/reconocimientos"
  },
  {
    label: "Foros empresariales",
    caption: "Gestión de foros empresariales",
    icon: "business_center",
    link: "/foros-empresariales"
  },
  {
    label: "Página oficial",
    caption: "Noticias, agenda y contenido",
    icon: "language",
    link: "/pagina-oficial"
  }
];

const leftDrawerOpen = ref(false);

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
}
</script>

<style scoped>
.admin-congress-button { max-width: min(52vw, 440px); font-size: inherit; }
.admin-congress-button :deep(.q-btn__content) { flex-wrap: nowrap; }
.admin-congress-button :deep(.block) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-congress-menu { min-width: 240px; max-width: min(90vw, 440px); max-height: 55vh; overflow-y: auto; }
:global(.admin-alert-menu) { width: min(92vw, 410px); background: #17332c; color: #f4fff7; border: 1px solid rgba(102, 245, 181, .22); border-radius: 14px; }
:global(.admin-alert-heading) { display: flex; align-items: center; gap: 8px; color: #f4fff7; font-weight: 700; }
:global(.admin-alert-item) { border-top: 1px solid rgba(255,255,255,.08); }
:global(.admin-alert-item .q-item__label--caption) { color: #b4c9be; }
:global(body.theme-light .admin-alert-menu) { background: #fff; color: #17372d; border-color: #d2e6d8; }
:global(body.theme-light .admin-alert-heading) { color: #17372d; }
:global(body.theme-light .admin-alert-item) { border-color: #e4eee8; }
:global(body.theme-light .admin-alert-item .q-item__label--caption) { color: #4a6658; }
</style>
