<template>
  <q-layout view="lHh Lpr lFf" class="personal-access-layout">
    <q-header class="personal-header">
      <q-toolbar class="personal-toolbar">
        <router-link to="/" class="personal-header__brand">
          <span class="personal-header__mark">
            <q-icon name="verified_user" size="22px" />
          </span>
          <span class="personal-header__title">{{
            usuarioPersonal?.rol === "VALIDADOR"
              ? "Control de acceso"
              : "Personal del congreso"
          }}</span>
        </router-link>
        <q-space />
        <template v-if="usuarioPersonal">
          <span class="personal-header__user gt-xs">{{ usuarioPersonal.nombre }}</span>
          <q-btn
            v-if="usuarioPersonal.rol === 'VALIDADOR'"
            flat
            no-caps
            icon="qr_code_scanner"
            :label="$q.screen.gt.xs ? 'Escanear' : undefined"
            to="/validar"
            class="personal-header__action"
            aria-label="Escanear QR"
          />
          <q-btn
            v-else
            flat
            no-caps
            icon="dashboard"
            :label="$q.screen.gt.xs ? 'Panel' : undefined"
            to="/admin/dashboard"
            class="personal-header__action"
            aria-label="Ir al panel"
          />
          <q-btn
            flat
            no-caps
            icon="logout"
            :label="$q.screen.gt.xs ? 'Salir' : undefined"
            class="personal-header__action"
            aria-label="Cerrar sesión"
            @click="cerrar"
          />
        </template>
        <q-btn
          v-else
          flat
          no-caps
          icon="home"
          :label="$q.screen.gt.xs ? 'Inicio' : undefined"
          to="/"
          class="personal-header__action"
          aria-label="Volver al inicio"
        />
        <q-btn
          round
          flat
          :icon="isLight ? 'dark_mode' : 'light_mode'"
          :aria-label="isLight ? 'Activar modo oscuro' : 'Activar modo claro'"
          :title="isLight ? 'Activar modo oscuro' : 'Activar modo claro'"
          class="personal-header__theme"
          @click="toggleTheme"
        />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <q-banner
        v-if="usuarioPersonal && !usuarioPersonal.contrasenaConfigurada"
        class="bg-amber-1 text-dark"
      >
        Configura tu contraseña para los próximos inicios de sesión.
        <template #action
          ><q-btn
            flat
            no-caps
            label="Configurar contraseña"
            to="/personal/acceso"
        /></template>
      </q-banner>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { useThemeMode } from "../composables/useThemeMode";
import {
  usuarioPersonal,
  salirPersonal,
  errorPersonal
} from "../services/personalService";
const router = useRouter();
const $q = useQuasar();
const { isLight, toggleTheme } = useThemeMode();
async function cerrar() {
  try {
    await salirPersonal();
    await router.replace("/personal/acceso");
  } catch (error) {
    $q.notify({ type: "negative", message: errorPersonal(error) });
  }
}
</script>
