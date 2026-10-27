<template>
  <q-layout view="lHh Lpr lFf">
    <q-header class="qr-header">
      <q-toolbar>
        <q-icon name="verified_user" size="28px" />
        <q-toolbar-title>{{
          usuarioPersonal?.rol === "VALIDADOR"
            ? "Control de acceso"
            : "Personal del congreso"
        }}</q-toolbar-title>
        <template v-if="usuarioPersonal">
          <span class="q-mr-sm gt-xs">{{ usuarioPersonal.nombre }}</span>
          <q-btn
            v-if="usuarioPersonal.rol === 'VALIDADOR'"
            flat
            no-caps
            icon="qr_code_scanner"
            label="Escanear"
            to="/validar"
          />
          <q-btn
            v-else
            flat
            no-caps
            icon="dashboard"
            label="Panel"
            to="/admin/dashboard"
          />
          <q-btn flat no-caps icon="logout" label="Salir" @click="cerrar" />
        </template>
        <q-btn v-else flat no-caps icon="home" label="Inicio" to="/" />
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
import {
  usuarioPersonal,
  salirPersonal,
  errorPersonal
} from "../services/personalService";
const router = useRouter();
const $q = useQuasar();
async function cerrar() {
  try {
    await salirPersonal();
    await router.replace("/personal/acceso");
  } catch (error) {
    $q.notify({ type: "negative", message: errorPersonal(error) });
  }
}
</script>

<style scoped>
.qr-header {
  background: #064e3b;
  color: white;
}
</style>
