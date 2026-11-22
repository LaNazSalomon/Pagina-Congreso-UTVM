<template>
  <q-page class="personal-page personal-login">
    <q-card flat bordered class="personal-card personal-card--login">
      <q-card-section class="personal-card__intro">
        <span class="personal-card__icon"><q-icon name="badge" size="34px" /></span>
        <span class="personal-card__eyebrow">PERSONAL DEL CONGRESO</span>
        <h1>{{
          registroInicial
            ? "Crear primera cuenta administradora"
            : cambioInicial
              ? "Elige tu contraseña"
              : "Acceso del personal"
        }}</h1>
        <p class="personal-card__description">{{
          registroInicial
            ? "Registra tu nombre y correo. Recibirás un enlace para elegir tu contraseña y activar tu cuenta administradora."
            : cambioInicial
              ? "Cambia la contraseña temporal por una personal. La usarás para entrar las próximas veces."
              : "Administradores y validadores: entra con tu correo y contraseña."
        }}</p>
      </q-card-section>
      <q-card-section class="personal-card__content">
        <q-banner
          v-if="error"
          rounded
          class="bg-red-1 text-negative q-mb-md"
          role="alert"
          >{{ error }}</q-banner
        >
        <q-banner
          v-if="aviso"
          rounded
          class="bg-green-1 text-positive q-mb-md"
          role="status"
          >{{ aviso }}</q-banner
        >
        <q-linear-progress
          v-if="cargandoInicio"
          indeterminate
          color="primary"
          class="q-mb-md"
        />
        <q-btn
          v-if="!estadoListo && !cargandoInicio"
          flat
          no-caps
          label="Reintentar conexión"
          @click="cargarInicio"
          class="q-mb-md"
        />
        <template v-if="cuentaAnterior">
          <p
            >Tu cuenta ya existe y tu sesión sigue activa. Te enviaremos un
            enlace para elegir tu contraseña al correo
            {{ cuentaAnterior.correo }}.</p
          >
          <q-btn
            class="personal-primary-btn full-width"
            no-caps
            label="Enviar enlace para elegir mi contraseña"
            :loading="ocupado"
            @click="configurarCuentaAnterior"
          />
        </template>
        <q-form v-else @submit="enviar" class="personal-form">
          <q-input
            v-if="registroInicial"
            v-model.trim="nombre"
            outlined
            :dark="!isLight"
            class="personal-field"
            label="Nombre completo"
            autocomplete="name"
            maxlength="150"
            :disable="ocupado || !estadoListo"
            :rules="[
              v => (v && v.trim().length >= 2) || 'Escribe tu nombre completo'
            ]"
          />
          <q-input
            v-model.trim="correo"
            outlined
            :dark="!isLight"
            class="personal-field"
            label="Correo del personal"
            type="email"
            autocomplete="username"
            maxlength="254"
            :disable="ocupado || cambioInicial || !estadoListo"
            :rules="[v => !!v || 'Escribe tu correo']"
          />
          <q-input
            v-if="!registroInicial && !cambioInicial"
            v-model="contrasena"
            outlined
            :dark="!isLight"
            class="personal-field"
            label="Contraseña"
            :type="mostrar ? 'text' : 'password'"
            autocomplete="current-password"
            maxlength="128"
            :disable="ocupado || !estadoListo"
            :rules="[v => !!v || 'Escribe tu contraseña']"
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
          <template v-if="cambioInicial">
            <q-input
              v-model="nueva"
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
                v =>
                  /[\p{P}\p{S}]/u.test(v) || 'Incluye un signo, como !, @ o #',
                v =>
                  v !== contrasena ||
                  'Elige una contraseña distinta a la temporal'
              ]"
            >
              <template #append
                ><q-btn
                  flat
                  round
                  dense
                  :icon="mostrar ? 'visibility_off' : 'visibility'"
                  aria-label="Mostrar u ocultar contraseña"
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
              :rules="[v => v === nueva || 'Las contraseñas deben coincidir']"
            />
          </template>
          <q-btn
            class="personal-primary-btn full-width"
            type="submit"
            :label="
              registroInicial
                ? 'Crear cuenta y enviar enlace'
                : cambioInicial
                  ? 'Guardar contraseña y entrar'
                  : 'Iniciar sesión'
            "
            :loading="ocupado"
            :disable="!estadoListo"
            no-caps
          />
          <q-btn
            v-if="cambioInicial"
            flat
            no-caps
            label="Volver al inicio de sesión"
            class="personal-text-btn full-width"
            :disable="ocupado"
            @click="volver"
          />
          <p v-if="!registroInicial && !cambioInicial" class="personal-card__help"
            >¿Olvidaste tu contraseña? Contacta a un administrador para que te
            envíe un enlace para restablecerla.</p
          >
        </q-form>
      </q-card-section>
      <q-card-actions align="center" class="personal-card__footer"
        ><q-btn flat no-caps to="/login" label="Acceso de participantes" class="personal-text-btn"
      /></q-card-actions>
    </q-card>
  </q-page>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useThemeMode } from "../composables/useThemeMode";
import { api } from "../services/api";
import {
  cargarSesionPersonal,
  destinoPersonal,
  entrarPersonal,
  cambiarContrasenaPersonal,
  errorPersonal,
  type UsuarioPersonal
} from "../services/personalService";
const route = useRoute();
const router = useRouter();
const { isLight } = useThemeMode();
const nombre = ref("");
const correo = ref(
  typeof route.query.correo === "string" ? route.query.correo : ""
);
const contrasena = ref("");
const nueva = ref("");
const confirmacion = ref("");
const mostrar = ref(false);
const registroInicial = ref(false);
const cambioInicial = ref(false);
const cuentaAnterior = ref<UsuarioPersonal | null>(null);
const cargandoInicio = ref(true);
const estadoListo = ref(false);
const ocupado = ref(false);
const error = ref("");
const aviso = ref("");
onMounted(cargarInicio);
async function cargarInicio() {
  cargandoInicio.value = true;
  estadoListo.value = false;
  error.value = "";
  try {
    const usuario = await cargarSesionPersonal();
    if (usuario) {
      if (!usuario.contrasenaConfigurada) {
        cuentaAnterior.value = usuario;
        estadoListo.value = true;
        return;
      }
      await router.replace(destinoPersonal(usuario, route.query.redirect));
      return;
    }
    registroInicial.value = (
      await api.get<{ requiereAdministradorInicial: boolean }>(
        "/personal/configuracion-inicial"
      )
    ).data.requiereAdministradorInicial;
    estadoListo.value = true;
  } catch {
    error.value = "No se pudo conectar con el servidor.";
  } finally {
    cargandoInicio.value = false;
  }
}
function volver() {
  cambioInicial.value = false;
  contrasena.value = "";
  nueva.value = "";
  confirmacion.value = "";
  error.value = "";
}
async function enviar() {
  if (ocupado.value || !estadoListo.value) return;
  ocupado.value = true;
  error.value = "";
  aviso.value = "";
  try {
    if (registroInicial.value) {
      const { data } = await api.post<{ mensaje: string }>(
        "/personal/configuracion-inicial",
        { nombre: nombre.value, correo: correo.value }
      );
      registroInicial.value = false;
      aviso.value = data.mensaje;
      return;
    }
    if (cambioInicial.value) {
      if (nueva.value !== confirmacion.value) return;
      const usuario = await cambiarContrasenaPersonal(
        correo.value,
        contrasena.value,
        nueva.value
      );
      volver();
      await router.replace(destinoPersonal(usuario, route.query.redirect));
    } else {
      const usuario = await entrarPersonal(correo.value, contrasena.value);
      if (!usuario) {
        cambioInicial.value = true;
        return;
      }
      contrasena.value = "";
      await router.replace(destinoPersonal(usuario, route.query.redirect));
    }
  } catch (err) {
    error.value = errorPersonal(err);
    // Otra pestaña pudo haber completado el alta mientras estaba abierto el formulario.
    if (registroInicial.value) {
      try {
        registroInicial.value = (
          await api.get<{ requiereAdministradorInicial: boolean }>(
            "/personal/configuracion-inicial"
          )
        ).data.requiereAdministradorInicial;
      } catch {
        /* Se conserva el error original. */
      }
    }
  } finally {
    ocupado.value = false;
  }
}
async function configurarCuentaAnterior() {
  if (ocupado.value || !cuentaAnterior.value) return;
  ocupado.value = true;
  error.value = "";
  try {
    correo.value = cuentaAnterior.value.correo;
    const { data } = await api.post<{ mensaje: string }>(
      "/personal/contrasena-inicial"
    );
    aviso.value = data.mensaje;
  } catch (err) {
    error.value = errorPersonal(err);
  } finally {
    ocupado.value = false;
  }
}
</script>
