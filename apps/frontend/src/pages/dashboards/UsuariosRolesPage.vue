<template>
  <q-page padding class="hero-page">
    <div class="row items-center justify-between q-gutter-md q-mb-lg">
      <div
        ><h1 class="text-h5 q-my-sm">Usuarios y roles</h1
        ><p class="text-grey-7 q-mb-none"
          >Administra las cuentas del personal y sus permisos.</p
        ></div
      >
      <q-btn
        color="primary"
        icon="person_add"
        label="Agregar personal"
        no-caps
        @click="abrir()"
      />
    </div>
    <q-banner
      v-if="error"
      class="bg-red-1 text-negative q-mb-md"
      rounded
      role="alert"
      >{{ error }}</q-banner
    >
    <q-table
      class="dashboard-table"
      :rows="usuarios"
      :columns="columnas"
      row-key="id"
      :loading="cargando"
      :filter="filtro"
      :pagination="{ rowsPerPage: 15 }"
      no-data-label="Todavía no hay cuentas"
      no-results-label="No hay coincidencias"
    >
      <template #top
        ><q-input
          v-model="filtro"
          outlined
          dense
          clearable
          label="Buscar personal"
          class="col-12 col-sm-6"
          ><template #prepend><q-icon name="search" /></template></q-input
        ><q-space /><q-btn
          flat
          round
          icon="refresh"
          aria-label="Actualizar lista"
          @click="cargar"
      /></template>
      <template #body-cell-rol="props"
        ><q-td :props="props"
          ><q-badge
            :color="props.row.rol === 'ADMINISTRADOR' ? 'primary' : 'teal'"
            >{{
              props.row.rol === "ADMINISTRADOR" ? "Administrador" : "Validador"
            }}</q-badge
          ></q-td
        ></template
      >
      <template #body-cell-estado="props"
        ><q-td :props="props">{{
          !props.row.activo
            ? "Desactivada"
            : props.row.correoVerificado
              ? "Activa"
              : "Pendiente de primer acceso"
        }}</q-td></template
      >
      <template #body-cell-acciones="props"
        ><q-td :props="props">
          <q-btn
            flat
            round
            dense
            icon="edit"
            aria-label="Editar cuenta"
            :disable="ocupado"
            @click="abrir(props.row)"
            ><q-tooltip>Editar nombre y rol</q-tooltip></q-btn
          >
          <q-btn
            flat
            round
            dense
            icon="lock_reset"
            aria-label="Restablecer contraseña"
            :disable="ocupado || !props.row.activo"
            @click="invitar(props.row)"
            ><q-tooltip
              >Enviar enlace para restablecer contraseña</q-tooltip
            ></q-btn
          >
          <q-btn
            flat
            round
            dense
            :icon="props.row.activo ? 'person_off' : 'person'"
            :color="props.row.activo ? 'negative' : 'positive'"
            :aria-label="
              props.row.activo ? 'Desactivar cuenta' : 'Activar cuenta'
            "
            :disable="ocupado"
            @click="cambiarEstado(props.row)"
            ><q-tooltip>{{
              props.row.activo ? "Desactivar cuenta" : "Activar cuenta"
            }}</q-tooltip></q-btn
          >
        </q-td></template
      >
    </q-table>
    <q-dialog v-model="dialogo" persistent>
      <q-card class="usuario-dialogo">
        <q-card-section
          ><h2 class="text-h6 q-my-none">{{
            editando ? "Editar personal" : "Agregar personal"
          }}</h2></q-card-section
        >
        <q-form @submit="guardar">
          <q-card-section class="q-gutter-md">
            <q-banner
              v-if="errorFormulario"
              class="bg-red-1 text-negative"
              rounded
              role="alert"
              >{{ errorFormulario }}</q-banner
            >
            <q-input
              v-model.trim="form.nombre"
              outlined
              label="Nombre completo"
              maxlength="150"
              :disable="ocupado"
              :rules="[v => v?.trim().length >= 2 || 'Escribe el nombre']"
            />
            <q-input
              v-model.trim="form.correo"
              outlined
              type="email"
              label="Correo"
              :disable="ocupado || !!editando"
              maxlength="254"
              :rules="[
                v =>
                  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ||
                  'Escribe un correo válido'
              ]"
            />
            <q-select
              v-model="form.rol"
              outlined
              label="Rol"
              :options="roles"
              emit-value
              map-options
              :disable="ocupado"
            />
            <p class="text-grey-7">{{
              editando
                ? "Cambiar el rol cerrará las sesiones de esta cuenta."
                : "La persona recibirá un enlace por correo para elegir su contraseña. Solo un administrador puede enviar estos enlaces."
            }}</p>
          </q-card-section>
          <q-card-actions align="right"
            ><q-btn
              flat
              label="Cancelar"
              no-caps
              v-close-popup
              :disable="ocupado" /><q-btn
              color="primary"
              type="submit"
              label="Guardar"
              no-caps
              :loading="ocupado"
          /></q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useQuasar, type QTableColumn } from "quasar";
import { useRouter } from "vue-router";
import { api } from "../../services/api";
import {
  cargarSesionPersonal,
  errorPersonal,
  usuarioPersonal,
  type RolPersonal,
  type UsuarioPersonal
} from "../../services/personalService";
const $q = useQuasar();
const router = useRouter();
const usuarios = ref<UsuarioPersonal[]>([]);
const cargando = ref(false);
const ocupado = ref(false);
const error = ref("");
const errorFormulario = ref("");
const filtro = ref("");
const dialogo = ref(false);
const editando = ref<string | null>(null);
const form = ref({ nombre: "", correo: "", rol: "VALIDADOR" as RolPersonal });
const roles = [
  { label: "Administrador", value: "ADMINISTRADOR" },
  { label: "Validador", value: "VALIDADOR" }
];
const columnas: QTableColumn[] = [
  {
    name: "nombre",
    label: "Nombre",
    field: "nombre",
    align: "left",
    sortable: true
  },
  {
    name: "correo",
    label: "Correo",
    field: "correo",
    align: "left",
    sortable: true
  },
  { name: "rol", label: "Rol", field: "rol", align: "left", sortable: true },
  { name: "estado", label: "Estado", field: "activo", align: "left" },
  { name: "acciones", label: "Acciones", field: "id", align: "right" }
];
onMounted(cargar);
async function cargar() {
  cargando.value = true;
  error.value = "";
  try {
    usuarios.value = (
      await api.get<UsuarioPersonal[]>("/personal/usuarios")
    ).data;
  } catch (err) {
    error.value = errorPersonal(err);
  } finally {
    cargando.value = false;
  }
}
function abrir(usuario?: UsuarioPersonal) {
  editando.value = usuario?.id ?? null;
  form.value = {
    nombre: usuario?.nombre ?? "",
    correo: usuario?.correo ?? "",
    rol: usuario?.rol ?? "VALIDADOR"
  };
  errorFormulario.value = "";
  dialogo.value = true;
}
async function comprobarSesion(id: string) {
  if (id === usuarioPersonal.value?.id) {
    const usuario = await cargarSesionPersonal();
    if (!usuario) await router.replace("/personal/acceso");
  }
}
async function guardar() {
  if (ocupado.value) return;
  ocupado.value = true;
  errorFormulario.value = "";
  try {
    if (editando.value) {
      await api.patch(`/personal/usuarios/${editando.value}`, {
        nombre: form.value.nombre,
        rol: form.value.rol
      });
      await comprobarSesion(editando.value);
      $q.notify({ type: "positive", message: "Cuenta actualizada." });
    } else {
      const { data } = await api.post<{
        invitacionEnviada: boolean;
        mensaje: string;
      }>("/personal/usuarios", form.value);
      $q.notify({
        type: data.invitacionEnviada ? "positive" : "warning",
        message: data.mensaje
      });
    }
    dialogo.value = false;
    if (usuarioPersonal.value) await cargar();
  } catch (err) {
    errorFormulario.value = errorPersonal(err);
  } finally {
    ocupado.value = false;
  }
}
function invitar(usuario: UsuarioPersonal) {
  $q.dialog({
    title: "Restablecer contraseña",
    message: `Se enviará un enlace a ${usuario.correo} para que ${usuario.nombre} elija su contraseña. Vence en 30 minutos. La contraseña actual seguirá funcionando hasta que guarde la nueva.`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    ocupado.value = true;
    try {
      const { data } = await api.post<{ mensaje: string }>(
        `/personal/usuarios/${usuario.id}/restablecer-contrasena`
      );
      $q.notify({ type: "positive", message: data.mensaje });
      await comprobarSesion(usuario.id);
      if (usuarioPersonal.value) await cargar();
    } catch (err) {
      $q.notify({ type: "negative", message: errorPersonal(err) });
    } finally {
      ocupado.value = false;
    }
  });
}
function cambiarEstado(usuario: UsuarioPersonal) {
  $q.dialog({
    title: usuario.activo ? "Desactivar cuenta" : "Activar cuenta",
    message: usuario.activo
      ? `¿Desactivar a ${usuario.nombre}? Se cerrarán sus sesiones.`
      : `¿Activar a ${usuario.nombre}?`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    ocupado.value = true;
    try {
      await api.patch(`/personal/usuarios/${usuario.id}`, {
        activo: !usuario.activo
      });
      await comprobarSesion(usuario.id);
      if (usuarioPersonal.value) await cargar();
    } catch (err) {
      $q.notify({ type: "negative", message: errorPersonal(err) });
    } finally {
      ocupado.value = false;
    }
  });
}
</script>
<style scoped>
.usuario-dialogo {
  width: min(94vw, 540px);
}
</style>
