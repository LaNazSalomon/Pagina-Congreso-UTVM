<template>
  <q-page class="personal-page personal-reset">
    <q-card flat bordered class="personal-card personal-card--reset">
      <q-card-section class="personal-card__intro">
        <span class="personal-card__icon"><q-icon name="lock_reset" size="34px" /></span>
        <span class="personal-card__eyebrow">PERSONAL DEL CONGRESO</span>
        <h1>{{
          completado ? "Contraseña guardada" : "Elige tu nueva contraseña"
        }}</h1>
        <p v-if="!completado" class="personal-card__description"
          >Escríbela dos veces. El enlace solo se puede usar una vez y vence en
          30 minutos.</p
        >
      </q-card-section>
      <q-card-section class="personal-card__content">
        <q-linear-progress v-if="cargando" indeterminate color="primary" />
        <q-banner
          v-if="error"
          rounded
          role="alert"
          class="bg-red-1 text-negative q-mb-md"
          >{{ error }}</q-banner
        >
        <template v-if="completado">
          <p role="status"
            >Tu contraseña quedó guardada y tus sesiones anteriores se cerraron.
            Inicia sesión con tu correo y nueva contraseña.</p
          >
          <q-btn
            class="personal-primary-btn full-width"
            no-caps
            to="/personal/acceso"
            label="Ir al inicio de sesión"
          />
        </template>
        <q-form v-else-if="valido" @submit="guardar" class="personal-form">
          <q-input
            v-model="contrasena"
            outlined
            :dark="!isLight"
            class="personal-field"
            label="Nueva contraseña"
            :type="mostrar ? 'text' : 'password'"
            autocomplete="new-password"
            maxlength="128"
            hint="De 8 a 128 caracteres, con mayúscula, minúscula, número y signo."
            :disable="ocupado"
            :rules="[
              v => [...v].length >= 8 || 'Usa al menos 8 caracteres',
              v => /\p{Lu}/u.test(v) || 'Incluye una mayúscula',
              v => /\p{Ll}/u.test(v) || 'Incluye una minúscula',
              v => /[0-9]/.test(v) || 'Incluye un número',
              v => /[\p{P}\p{S}]/u.test(v) || 'Incluye un signo, como !, @ o #'
            ]"
          >
            <template #append
              ><q-btn
                flat
                round
                dense
                :icon="mostrar ? 'visibility_off' : 'visibility'"
                :aria-label="
                  mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña'
                "
                @click="mostrar = !mostrar"
            /></template>
          </q-input>
          <q-input
            v-model="confirmacion"
            outlined
            :dark="!isLight"
            class="personal-field"
            label="Confirmar contraseña"
            :type="mostrar ? 'text' : 'password'"
            autocomplete="new-password"
            maxlength="128"
            :disable="ocupado"
            :rules="[
              v => !!v || 'Confirma tu contraseña',
              v => v === contrasena || 'Las contraseñas deben coincidir'
            ]"
          />
          <q-btn
            no-caps
            type="submit"
            label="Guardar nueva contraseña"
            class="personal-primary-btn full-width"
            :loading="ocupado"
          />
        </q-form>
        <template v-else-if="!cargando">
          <p class="personal-card__description"
            >Abre el enlace más reciente que recibiste por correo. Si venció,
            pide a un administrador que te envíe otro.</p
          >
          <q-btn
            flat
            no-caps
            to="/personal/acceso"
            label="Ir al inicio de sesión"
            class="personal-text-btn full-width"
          />
        </template>
      </q-card-section>
    </q-card>
  </q-page>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isAxiosError } from "axios";
import { useThemeMode } from "../composables/useThemeMode";
import { api } from "../services/api";
import { errorPersonal } from "../services/personalService";
const route = useRoute();
const router = useRouter();
const { isLight } = useThemeMode();
// El fragmento no se envía al servidor web ni como Referer. Se retira de la URL.
let token = new URLSearchParams(route.hash.slice(1)).get("token") || "";
const contrasena = ref("");
const confirmacion = ref("");
const mostrar = ref(false);
const cargando = ref(true);
const ocupado = ref(false);
const valido = ref(false);
const completado = ref(false);
const error = ref("");
onMounted(async () => {
  try {
    if (route.hash)
      await router.replace({ path: route.path, query: {}, hash: "" });
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      error.value = "Falta un enlace válido para elegir tu contraseña.";
      return;
    }
    await api.post("/personal/acceso/comprobar-enlace", { token });
    valido.value = true;
  } catch (err) {
    error.value = errorPersonal(
      err,
      "No se pudo comprobar el enlace. Vuelve a abrirlo desde tu correo."
    );
  } finally {
    cargando.value = false;
  }
});
async function guardar() {
  if (ocupado.value || !valido.value || contrasena.value !== confirmacion.value)
    return;
  ocupado.value = true;
  error.value = "";
  try {
    await api.post("/personal/acceso/restablecer-contrasena", {
      token,
      nuevaContrasena: contrasena.value
    });
    token = "";
    contrasena.value = "";
    confirmacion.value = "";
    completado.value = true;
  } catch (err) {
    error.value = errorPersonal(err);
    if (isAxiosError(err) && err.response?.status === 401) valido.value = false;
  } finally {
    ocupado.value = false;
  }
}
</script>
