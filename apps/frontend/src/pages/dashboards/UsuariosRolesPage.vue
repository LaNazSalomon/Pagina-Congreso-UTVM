<template>
  <q-page class="hero-page q-pa-md">
    <div class="row justify-between items-center q-mb-lg">
      <div>
        <div class="text-h4 text-weight-bold">Usuarios y roles</div>
        <div class="text-subtitle2 text-grey-7">
          Administra las cuentas del personal y sus permisos.
        </div>
      </div>
      <q-btn
        unelevated
        color="primary"
        icon="person_add"
        label="Agregar personal"
        :disable="ocupado"
        @click="abrir()"
      />
    </div>
    <StatePanel
      v-if="error"
      class="q-mb-md"
      title="No se pudo cargar el personal"
      :description="error"
      icon="warning"
      tone="warning"
    />
    <q-card class="dashboard-card q-pa-md">
      <q-card-section>
        <q-table
          class="dashboard-table"
          flat
          bordered
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
              :dark="!isLight"
              dense
              clearable
              label="Buscar personal"
              class="col-12 col-sm-6"
              ><template #prepend><q-icon name="search" /></template></q-input
            ><q-space /><q-btn
              flat
              round
              color="primary"
              icon="refresh"
              aria-label="Actualizar lista"
              :loading="cargando"
              @click="cargar"
          /></template>
          <template #body-cell-rol="props"
            ><q-td :props="props"
              ><q-badge
                :color="props.row.rol === 'ADMINISTRADOR' ? 'primary' : 'teal'"
                :text-color="
                  props.row.rol === 'ADMINISTRADOR' ? 'black' : 'white'
                "
                >{{
                  props.row.rol === "ADMINISTRADOR"
                    ? "Administrador"
                    : "Validador"
                }}</q-badge
              ></q-td
            ></template
          >
          <template #body-cell-estado="props"
            ><q-td :props="props">
              <q-badge
                :color="
                  !props.row.activo
                    ? 'negative'
                    : props.row.correoVerificado
                      ? 'positive'
                      : 'warning'
                "
                :text-color="
                  props.row.activo && props.row.correoVerificado
                    ? 'black'
                    : 'white'
                "
                >{{
                  !props.row.activo
                    ? "Desactivada"
                    : props.row.correoVerificado
                      ? "Activa"
                      : "Pendiente de primer acceso"
                }}</q-badge
              >
            </q-td></template
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
      </q-card-section>
    </q-card>
    <q-dialog v-model="dialogo" persistent>
      <q-card class="admin-form-dialog">
        <q-card-section class="admin-form-dialog__header">
          <q-avatar class="admin-form-dialog__icon" icon="manage_accounts" />
          <div>
            <div class="text-h6 text-weight-bold">{{
              editando ? "Editar personal" : "Agregar personal"
            }}</div>
            <div class="admin-form-dialog__subtitle">
              {{
                editando
                  ? "Actualiza el nombre y el rol de esta cuenta."
                  : "Registra a un administrador o validador."
              }}
            </div>
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section class="admin-form-dialog__body">
          <q-form
            class="admin-form row q-col-gutter-md"
            @submit.prevent="guardar"
          >
            <q-banner
              v-if="errorFormulario"
              class="bg-red-1 text-negative col-12"
              rounded
              role="alert"
              >{{ errorFormulario }}</q-banner
            >
            <q-input
              v-model.trim="form.nombre"
              class="col-12"
              :dark="!isLight"
              dense
              autofocus
              label="Nombre completo"
              maxlength="150"
              :disable="ocupado"
              :rules="[v => v?.trim().length >= 2 || 'Escribe el nombre']"
            />
            <q-input
              v-model.trim="form.correo"
              class="col-12"
              :dark="!isLight"
              dense
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
              class="col-12"
              :dark="!isLight"
              dense
              label="Rol"
              :options="roles"
              emit-value
              map-options
              :disable="ocupado"
            />
            <p class="admin-form-dialog__subtitle col-12 q-mb-none">{{
              editando
                ? "Cambiar el rol cerrará las sesiones de esta cuenta."
                : "La persona recibirá un enlace por correo para elegir su contraseña. Solo un administrador puede enviar estos enlaces."
            }}</p>
            <div class="admin-form-dialog__actions col-12">
              <q-btn
                class="admin-form-dialog__cancel"
                flat
                label="Cancelar"
                v-close-popup
                :disable="ocupado"
              />
              <q-btn
                class="admin-form-dialog__submit"
                unelevated
                color="primary"
                type="submit"
                label="Guardar"
                :loading="ocupado"
                :disable="ocupado"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useQuasar, type QTableColumn } from "quasar";
import { useRouter } from "vue-router";
import StatePanel from "../../components/feedback/StatePanel.vue";
import { useThemeMode } from "../../composables/useThemeMode";
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
const { isLight } = useThemeMode();
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
