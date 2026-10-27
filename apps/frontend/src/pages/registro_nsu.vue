<template>
  <div class="registro-page">
    <section class="registro-header">
      <div class="row items-start justify-between q-col-gutter-md">
        <div class="col">
          <h1>Registro NSU (Nivel Superior)</h1>
          <p>
            El tutor o docente podrá registrar desde un participante y hasta n
            participantes o subir archivo CSV.
          </p>
        </div>

        <div class="col-auto">
          <q-btn
            flat
            label="Volver"
            text-color="white"
            @click="goToParticipantes"
          />
        </div>
      </div>
    </section>

    <section class="registro-card">
      <div class="section-title">
        <q-icon name="person" />
        <span>Datos del participante</span>
      </div>

      <q-form class="form-grid">
        <q-select
          v-model="congresoId"
          :options="opcionesCongreso"
          emit-value
          map-options
          outlined
          label="Congreso y periodo de asistencia *"
          class="light-input"
          style="grid-column: 1 / -1"
          :loading="cargandoDias"
          :disable="guardando || cargandoDias || participantes.length > 0"
          :hint="
            participantes.length
              ? 'Todos los participantes de este registro pertenecen al mismo congreso.'
              : ''
          "
        />
        <q-banner
          v-if="errorDias"
          class="bg-red-1 text-negative"
          style="grid-column: 1 / -1"
        >
          {{ errorDias }}
          <template #action
            ><q-btn
              flat
              label="Reintentar"
              :loading="cargandoDias"
              @click="cargarDias"
          /></template>
        </q-banner>
        <q-input
          outlined
          v-model="form.nombre"
          label="Nombre(s) *"
          placeholder="Ingresa el nombre o nombres"
          class="light-input"
        />

        <q-input
          outlined
          v-model="form.apellidoPaterno"
          label="Apellido paterno *"
          placeholder="Ingresa el apellido paterno"
          class="light-input"
        />

        <q-input
          outlined
          v-model="form.apellidoMaterno"
          label="Apellido materno"
          placeholder="Ingresa el apellido materno"
          class="light-input"
        />

        <q-input
          outlined
          v-model="form.correo"
          label="Correo electrónico *"
          placeholder="ejemplo@correo.com"
          type="email"
          class="light-input"
        />

        <q-input
          outlined
          v-model="form.institucion"
          label="Institución *"
          placeholder="Nombre de la institución"
          class="light-input"
        />

        <q-input
          outlined
          v-model="form.carrera"
          label="Carrera *"
          placeholder="Nombre de la carrera"
          class="light-input"
        />
        <div class="telefono-container">
          <q-input
            outlined
            v-model="form.telefono"
            label="Teléfono *"
            placeholder="Ej. 55 1234 5678"
            class="light-input"
          />
        </div>

        <div class="dark-box registro-fechas-box">
          <div class="box-label">Días de participación *</div>

          <div class="days-grid">
            <q-checkbox
              v-for="dia in diasOptions"
              :key="dia.value"
              v-model="form.dias"
              :val="dia.value"
              :label="dia.label"
              color="primary"
              :disable="cargandoDias || guardando"
              dark
            />
          </div>
        </div>

        <div class="dark-box">
          <div class="box-label">Monto del participante</div>
          <div class="amount">${{ montoParticipanteActual.toFixed(2) }}</div>
          <div class="box-help"
            >${{ costoPorDia.toFixed(2) }} MXN por día seleccionado</div
          >
        </div>

        <div class="add-participant-row">
          <q-btn
            outline
            icon="add"
            label="Agregar participante"
            class="btn-outline-green"
            @click="agregarParticipante"
            :disable="cargandoDias || !!errorDias || !congresoId || guardando"
          />
        </div>

        <div class="upload-box">
          <div class="box-label">Comprobante de pago *</div>

          <q-file
            ref="fileInput"
            v-model="form.comprobante"
            accept=".pdf,.jpg,.jpeg,.png"
            style="display: none"
          />

          <div class="file-input upload-layout">
            <div class="upload-left">
              <q-icon name="cloud_upload" size="42px" />

              <div class="upload-text">
                <strong>Arrastra tu archivo aquí o selecciona</strong>
                <span v-if="!form.comprobante">
                  Formatos permitidos: PDF, JPG, JPEG, PNG. Máx. 10 MB
                </span>
                <span v-else>
                  Archivo seleccionado: {{ form.comprobante.name }}
                </span>
              </div>
            </div>

            <q-btn
              outline
              icon="upload"
              label="Buscar archivo"
              class="btn-outline-green"
              @click="abrirSelector"
            />
          </div>
        </div>
      </q-form>
    </section>

    <section class="registro-card q-mt-lg">
      <div class="section-title">
        <q-icon name="groups" />
        <span>Participantes registrados</span>
      </div>

      <q-table
        flat
        bordered
        dark
        :rows="participantes"
        :columns="columns"
        row-key="id"
        class="registro-table"
        no-data-label="Aún no hay participantes registrados."
      >
        <template v-slot:body-cell-acciones="props">
          <q-td :props="props">
            <q-btn
              flat
              round
              dense
              icon="delete"
              class="btn-delete-participant"
              @click="eliminarParticipante(props.row.id)"
            />
          </q-td>
        </template>
      </q-table>
      <div class="totals-box q-mt-md">
        <div class="total-item">
          <span>Participantes registrados</span>
          <strong>{{ participantes.length }}</strong>
        </div>

        <div class="total-item">
          <span>Total general a pagar</span>
          <strong>${{ totalGeneral.toFixed(2) }}</strong>
        </div>

        <div class="total-actions">
          <q-file
            ref="csvInput"
            v-model="archivoCsv"
            style="display: none"
            @update:model-value="leerCsv"
          />

          <q-btn
            outline
            icon="upload"
            label="Cargar archivo CSV"
            :disable="cargandoDias || !!errorDias || !congresoId || guardando"
            class="btn-outline-green"
            @click="abrirCsv"
          />

          <q-btn
            class="btn-primary-blue"
            icon="save"
            label="GUARDAR PARTICIPANTES"
            :disable="cargandoDias || !!errorDias || !congresoId || guardando"
            @click="abrirResumenRegistro"
          />
        </div>
      </div>
    </section>
    <q-dialog v-model="mostrarResumenRegistro" persistent>
      <q-card class="modal-resumen-nsu">
        <q-card-section class="modal-header">
          <div class="text-h6 text-weight-bold">Confirmar registro NSU</div>
          <div class="text-caption">
            Revisa la información antes de guardar.
          </div>
        </q-card-section>

        <q-card-section class="modal-info">
          <div><strong>Participantes:</strong> {{ participantes.length }}</div>
          <div
            ><strong>Congreso:</strong> {{ congresoSeleccionado?.nombre }}</div
          >
          <div><strong>Total:</strong> ${{ totalGeneral.toFixed(2) }}</div>
          <div><strong>Comprobante:</strong> {{ form.comprobante?.name }}</div>
        </q-card-section>

        <q-card-section>
          <q-table
            flat
            bordered
            dense
            :rows="participantes"
            :columns="columnsResumen"
            row-key="id"
            class="tabla-resumen-nsu"
            :rows-per-page-options="[5]"
          />
        </q-card-section>

        <q-card-actions align="right" class="modal-actions">
          <q-btn flat label="Cancelar" class="btn-modal-cancel" v-close-popup />

          <q-btn
            class="btn-primary-blue"
            icon="save"
            label="Confirmar y guardar"
            :loading="guardando"
            @click="guardarParticipantes"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { guardarRegistroNsu } from "../services/registroNsuService";
import { isAxiosError } from "axios";
import { Notify } from "quasar";
import {
  useDiasRegistro,
  formatoDiasRegistro
} from "../composables/useDiasRegistro";

const router = useRouter();
const {
  congresoId,
  congresoSeleccionado,
  opcionesCongreso,
  diasOptions,
  costoPorDia,
  cargandoDias,
  errorDias,
  cargarDias
} = useDiasRegistro("NSU");

const form = ref({
  nombre: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  correo: "",
  institucion: "",
  carrera: "",
  telefono: "",
  dias: [] as string[],
  comprobante: null as File | null
});

interface Participante {
  id: number;
  nombreCompleto: string;
  correo: string;
  institucion: string;
  carrera: string;
  telefono: string;
  dias: string;
  diaEventoIds: string[];
  monto: string;
  montoNumero: number;
}

const participantes = ref<Participante[]>([]);

watch(congresoId, () => {
  form.value.dias = [];
});

const montoParticipanteActual = computed(() => {
  return form.value.dias.length * costoPorDia.value;
});

const totalGeneral = computed(() => {
  return participantes.value.reduce((total, participante) => {
    return total + participante.montoNumero;
  }, 0);
});

const columns = [
  { name: "id", label: "#", field: "id", align: "left" as const },
  {
    name: "nombreCompleto",
    label: "Nombre completo",
    field: "nombreCompleto",
    align: "left" as const
  },
  {
    name: "correo",
    label: "Correo electrónico",
    field: "correo",
    align: "left" as const
  },
  {
    name: "institucion",
    label: "Institución",
    field: "institucion",
    align: "left" as const
  },
  {
    name: "carrera",
    label: "Carrera",
    field: "carrera",
    align: "left" as const
  },
  {
    name: "telefono",
    label: "Teléfono",
    field: "telefono",
    align: "left" as const
  },
  {
    name: "dias",
    label: "Fechas de asistencia",
    field: (row: Participante) => formatoDiasRegistro(row.dias),
    align: "left" as const
  },
  { name: "monto", label: "Monto", field: "monto", align: "left" as const },
  {
    name: "acciones",
    label: "Acciones",
    field: "acciones",
    align: "center" as const
  }
];

function agregarParticipante() {
  if (!congresoId.value || cargandoDias.value || errorDias.value) return;
  const nombre = form.value.nombre.trim();
  const apellidoPaterno = form.value.apellidoPaterno.trim();
  const apellidoMaterno = form.value.apellidoMaterno.trim();
  const correo = form.value.correo.trim().toLowerCase();
  const institucion = form.value.institucion.trim();
  const carrera = form.value.carrera.trim();
  const telefono = form.value.telefono.replace(/\s/g, "").trim();
  const dias = form.value.dias;

  if (!nombre) {
    Notify.create({
      type: "warning",
      message: "El nombre es obligatorio.",
      position: "top"
    });
    return;
  }

  if (!apellidoPaterno) {
    Notify.create({
      type: "warning",
      message: "El apellido paterno es obligatorio.",
      position: "top"
    });
    return;
  }

  if (!correo) {
    Notify.create({
      type: "warning",
      message: "El correo electrónico es obligatorio.",
      position: "top"
    });
    return;
  }

  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!correoValido.test(correo)) {
    Notify.create({
      type: "warning",
      message: "Ingresa un correo electrónico válido.",
      position: "top"
    });
    return;
  }

  if (!institucion) {
    Notify.create({
      type: "warning",
      message: "La institución es obligatoria.",
      position: "top"
    });
    return;
  }

  if (!carrera) {
    Notify.create({
      type: "warning",
      message: "La carrera es obligatoria.",
      position: "top"
    });
    return;
  }

  if (!telefono) {
    Notify.create({
      type: "warning",
      message: "El teléfono es obligatorio.",
      position: "top"
    });
    return;
  }

  if (!/^\d{10}$/.test(telefono)) {
    Notify.create({
      type: "warning",
      message: "El teléfono debe contener exactamente 10 dígitos.",
      position: "top"
    });
    return;
  }

  if (dias.length === 0) {
    Notify.create({
      type: "warning",
      message: "Selecciona al menos un día de participación.",
      position: "top"
    });
    return;
  }

  const correoDuplicado = participantes.value.some(
    participante => participante.correo.trim().toLowerCase() === correo
  );

  if (correoDuplicado) {
    Notify.create({
      type: "warning",
      message: "Este correo ya fue agregado a la tabla.",
      position: "top"
    });
    return;
  }

  const monto = montoParticipanteActual.value;

  const nombreCompleto = [nombre, apellidoPaterno, apellidoMaterno]
    .filter(Boolean)
    .join(" ");

  participantes.value.push({
    id: participantes.value.length + 1,
    nombreCompleto,
    correo,
    institucion,
    carrera,
    telefono,
    dias: diasOptions.value
      .filter(dia => dias.includes(dia.value))
      .map(dia => dia.fecha)
      .join(","),
    diaEventoIds: [...dias],
    monto: `$${monto.toFixed(2)}`,
    montoNumero: monto
  });

  // Se conserva el comprobante que ya hubiera seleccionado.
  const comprobanteActual = form.value.comprobante;

  form.value = {
    nombre: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
    correo: "",
    institucion: "",
    carrera: "",
    telefono: "",
    dias: [],
    comprobante: comprobanteActual
  };

  Notify.create({
    type: "positive",
    message: "Participante agregado correctamente.",
    position: "top"
  });
}
const fileInput = ref();

function abrirSelector() {
  fileInput.value?.pickFiles();
}

import Papa from "papaparse";

const archivoCsv = ref<File | null>(null);
const csvInput = ref();

function abrirCsv() {
  csvInput.value?.pickFiles();
}

function leerCsv(file: File | null) {
  if (!file) return;

  Papa.parse<Record<string, string>>(file, {
    header: true,
    skipEmptyLines: true,
    complete: result => {
      try {
        if (result.errors.length)
          throw new Error("Revisa el formato del archivo CSV.");
        const filas = result.data;

        const nuevosParticipantes: Participante[] = filas.map((fila, index) => {
          const entradas = (fila.dias || "")
            .split(",")
            .map(dia => dia.trim())
            .filter(Boolean);
          if (!entradas.length)
            throw new Error(
              `Fila ${index + 1}: indica al menos una fecha de asistencia.`
            );
          const seleccion = entradas.map(entrada => {
            const ordinal = entrada.match(/^d[ií]a[\s_]*(\d+)$/i);
            const dia = ordinal
              ? diasOptions.value[Number(ordinal[1]) - 1]
              : diasOptions.value.find(
                  dia => dia.fecha === entrada || dia.value === entrada
                );
            if (!dia)
              throw new Error(
                `Fila ${index + 1}: la fecha ${entrada} no pertenece al congreso seleccionado. Usa fechas AAAA-MM-DD.`
              );
            return dia;
          });
          if (
            new Set(seleccion.map(dia => dia.value)).size !== seleccion.length
          )
            throw new Error(`Fila ${index + 1}: hay fechas repetidas.`);
          const monto = seleccion.length * costoPorDia.value;

          return {
            id: participantes.value.length + index + 1,
            nombreCompleto:
              fila.nombreCompleto ||
              `${fila.nombre || ""} ${fila.apellidoPaterno || ""} ${fila.apellidoMaterno || ""}`.trim(),
            correo: fila.correo || "",
            institucion: fila.institucion || "",
            carrera: fila.carrera || "",
            telefono: fila.telefono || "",
            dias: seleccion.map(dia => dia.fecha).join(","),
            diaEventoIds: seleccion.map(dia => dia.value),
            monto: `$${monto.toFixed(2)}`,
            montoNumero: monto
          };
        });

        participantes.value.push(...nuevosParticipantes);
      } catch (error) {
        Notify.create({
          type: "warning",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo importar el CSV."
        });
      }
      archivoCsv.value = null;
    }
  });
}
async function guardarParticipantes() {
  if (
    guardando.value ||
    !congresoId.value ||
    cargandoDias.value ||
    errorDias.value
  )
    return;
  if (participantes.value.length === 0) {
    Notify.create({
      type: "warning",
      message: "Agrega al menos un participante antes de guardar."
    });
    return;
  }

  if (!form.value.comprobante) {
    Notify.create({
      type: "warning",
      message: "Debes cargar el comprobante de pago."
    });
    return;
  }

  guardando.value = true;
  try {
    const participantesPayload = participantes.value.map(participante => ({
      nombreCompleto: participante.nombreCompleto,
      correo: participante.correo,
      institucion: participante.institucion,
      carrera: participante.carrera,
      telefono: participante.telefono,
      dias: participante.dias,
      diaEventoIds: participante.diaEventoIds,
      montoNumero: participante.montoNumero
    }));

    const respuesta = await guardarRegistroNsu(
      participantesPayload,
      form.value.comprobante,
      congresoId.value
    );

    console.log("Registro guardado:", respuesta);

    mostrarResumenRegistro.value = false;
    participantes.value = [];
    archivoCsv.value = null;

    form.value = {
      nombre: "",
      apellidoPaterno: "",
      apellidoMaterno: "",
      correo: "",
      institucion: "",
      carrera: "",
      telefono: "",
      dias: [],
      comprobante: null
    };

    Notify.create({
      type: "positive",
      message: "Registro NSU guardado correctamente."
    });
  } catch (error) {
    console.error("ERROR COMPLETO:", error);
    mostrarResumenRegistro.value = false;
    const detalle = isAxiosError<{ message?: string | string[] }>(error)
      ? error.response?.data.message
      : undefined;
    Notify.create({
      type: "negative",
      message: Array.isArray(detalle)
        ? detalle.join(", ")
        : detalle || "Ocurrió un error al guardar el registro."
    });
  } finally {
    guardando.value = false;
  }
}
function eliminarParticipante(id: number) {
  participantes.value = participantes.value
    .filter(participante => participante.id !== id)
    .map((participante, index) => ({
      ...participante,
      id: index + 1
    }));

  Notify.create({
    type: "positive",
    message: "Participante eliminado correctamente."
  });
}
const mostrarResumenRegistro = ref(false);
const guardando = ref(false);
const columnsResumen = columns.filter(column => column.name !== "acciones");
function abrirResumenRegistro() {
  if (participantes.value.length === 0) {
    Notify.create({
      type: "warning",
      message: "Agrega al menos un participante antes de guardar."
    });
    return;
  }

  if (!form.value.comprobante) {
    Notify.create({
      type: "warning",
      message: "Debes cargar el comprobante de pago."
    });
    return;
  }

  mostrarResumenRegistro.value = true;
}

function goToParticipantes() {
  void router.push("/participantes");
}
</script>
<style lang="scss">
@import "../css/registro-nsu.scss";
</style>
