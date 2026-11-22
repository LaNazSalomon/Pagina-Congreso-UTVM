<template>
  <q-card class="dashboard-card q-pa-md">
    <q-card-section>
      <div class="text-h6">Plantillas de reconocimientos</div>
      <p class="text-caption q-mt-sm">
        Configura una versión por congreso y tipo. Al activar otra versión, las próximas
        descargas individuales y en ZIP usarán ese diseño, incluso para reconocimientos ya emitidos.
        Las versiones anteriores siguen disponibles aquí.
      </p>
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md-7 self-center">
          Congreso: <strong>{{ selectedCongress?.nombre || "Selecciona un congreso en la barra superior" }}</strong>
        </div>
        <div class="col-12 col-md-5">
          <q-select v-model="tipo" :dark="!isLight" outlined dense emit-value map-options
            label="Tipo de reconocimiento" :options="tipoOptions" />
        </div>
      </div>

      <div v-if="congresoId" class="row q-col-gutter-lg">
        <div class="col-12 col-lg-8">
          <q-file v-model="imagen" :dark="!isLight" outlined dense accept=".jpg,.jpeg,image/jpeg"
            label="Imagen JPG de cualquier proporción (máximo 8 MB)" @update:model-value="onImageChange">
            <template #prepend><q-icon name="upload_file" /></template>
          </q-file>
          <div class="text-caption q-mt-xs">El PDF conserva la proporción del JPG, sin recortarlo ni deformarlo.</div>
          <div v-if="imageUrl" ref="canvas" class="template-canvas q-mt-md"
            :style="{ aspectRatio: `${layout.pageWidth} / ${layout.pageHeight}` }">
            <img :src="imageUrl" alt="Vista de la plantilla" />
            <div v-for="(box, index) in boxes" :key="index" class="template-box"
              :style="boxStyle(box)" @pointerdown="startDrag($event, index)">
              {{ sampleLabel(index) }}
            </div>
          </div>
          <div v-else class="template-placeholder q-mt-md">Sube un JPG para configurar una nueva versión.</div>
          <div class="text-caption q-mt-sm">Arrastra los recuadros para mover el texto. Ajusta tamaño y ancho con los controles.</div>

          <div v-for="(box, index) in boxes" :key="`controls-${index}`" class="q-mt-md">
            <div class="text-subtitle2 q-mb-sm">{{ fieldLabel(index) }}</div>
            <div class="row q-col-gutter-sm">
              <div v-for="property in boxProperties" :key="property.key" class="col-6 col-sm">
                <q-input v-model.number="box[property.key]" type="number" :dark="!isLight" outlined dense
                  :label="property.label" :min="property.key === 'size' ? 10 : 0" :step="property.key === 'size' ? 1 : 0.5" />
              </div>
            </div>
          </div>

          <div class="row q-gutter-sm q-mt-lg">
            <q-btn outline color="primary" icon="preview" label="Vista previa"
              :disable="!imagen || busy" :loading="previewing" @click="preview" />
            <q-btn unelevated color="primary" icon="save" label="Guardar nueva versión"
              :disable="!imagen || busy" :loading="saving" @click="save" />
          </div>
        </div>

        <div class="col-12 col-lg-4">
          <div class="text-subtitle1 text-weight-medium q-mb-sm">Versiones guardadas</div>
          <q-inner-loading :showing="loadingVersions" />
          <div v-if="!loadingVersions && !currentVersions.length" class="text-caption q-mb-md">
            Aún no hay plantillas para este tipo. Sube un JPG, guarda una versión y actívala para emitir reconocimientos.
          </div>
          <q-card v-for="version in currentVersions" :key="version.id" flat bordered class="version-card q-mb-sm">
            <q-card-section class="q-pa-sm">
              <div class="row items-center justify-between">
                <strong>Versión {{ version.version }}</strong>
                <q-badge :color="version.activa ? 'positive' : 'grey'">
                  {{ version.activa ? 'Activa' : 'Borrador / anterior' }}
                </q-badge>
              </div>
              <div class="text-caption q-mt-xs">{{ formatDate(version.created_at) }}</div>
              <div v-if="version.activada_en" class="text-caption">Activada: {{ formatDate(version.activada_en) }}</div>
              <div class="row q-gutter-xs q-mt-sm">
                <q-btn dense flat color="negative" icon="delete" label="Eliminar"
                  :loading="deletingId === version.id" :disable="busy" @click="deleteVersion(version)" />
                <q-btn dense flat color="primary" icon="picture_as_pdf" label="PDF de prueba"
                  :loading="previewSavedId === version.id" :disable="previewSavedId !== null"
                  @click="downloadSavedPreview(version)" />
                <q-btn v-if="!version.activa" dense flat color="primary" icon="check_circle"
                  label="Activar" :loading="activatingId === version.id" @click="activate(version)" />
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </q-card-section>
  </q-card>

  <q-dialog v-model="showPreview" maximized>
    <q-card class="preview-dialog" :class="{ 'preview-dialog--light': isLight }">
      <q-bar class="preview-bar">
        Vista previa del reconocimiento
        <q-space />
        <q-btn dense flat icon="download" label="Descargar PDF de prueba" @click="downloadPreview" />
        <q-btn dense flat icon="close" v-close-popup aria-label="Cerrar vista previa" />
      </q-bar>
      <div class="preview-content">
        <div v-if="imageUrl" class="preview-canvas"
          :style="{ aspectRatio: `${layout.pageWidth} / ${layout.pageHeight}` }">
          <img :src="imageUrl" alt="Diseño del reconocimiento" />
          <div v-for="(box, index) in boxes" :key="`preview-${index}`"
            class="preview-text" :style="boxStyle(box)">
            {{ sampleLabel(index) }}
          </div>
        </div>
        <p class="text-caption q-mt-md">El PDF de prueba contiene estos datos de ejemplo y está listo para descargar.</p>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useQuasar } from "quasar";
import { api } from "../../services/api";
import { useAdminCongreso } from "../../composables/useAdminCongreso";
import { useDeleteConfirmation } from "../../composables/useDeleteConfirmation";
import { useThemeMode } from "../../composables/useThemeMode";
import type { ReconocimientoTipo } from "../../types";

interface Box { x: number; yFromTop: number; width: number; height: number; size: number }
interface Layout { nameBox: Box; detailBoxes: Box[]; pageWidth: number; pageHeight: number }
interface Version {
  id: string; tipo: ReconocimientoTipo; version: number; layout: Layout;
  activa: boolean; activada_en: string | null; created_at: string;
  congreso: { id: string };
}

const basePageWidth = 768.25;
const basePageHeight = 598.125;
const pageSizeForImage = (width: number, height: number) => {
  const scale = basePageWidth / Math.max(width, height);
  return { pageWidth: width * scale, pageHeight: height * scale };
};
const tipoOptions: { label: string; value: ReconocimientoTipo }[] = [
  { label: "Participantes (asistentes)", value: "GENERAL" },
  { label: "Talleristas (ponentes y panelistas)", value: "TALLERISTA" },
  { label: "Conferencistas (ponentes y panelistas)", value: "CONFERENCISTA" },
  { label: "Evaluadores de Hackatón (jurado)", value: "HACKATON_EVALUADOR" },
  { label: "Premiación de Hackatón (equipos ganadores)", value: "HACKATON_PREMIACION" }
];
const boxProperties: { key: keyof Box; label: string }[] = [
  { key: "x", label: "Izquierda" }, { key: "yFromTop", label: "Arriba" },
  { key: "width", label: "Ancho" }, { key: "height", label: "Alto" },
  { key: "size", label: "Letra" }
];
const defaultLayout = (value: ReconocimientoTipo): Layout => {
  const standard: Box = { x: 115.71, yFromTop: 321.43, width: 574.46, height: 29.08, size: 24 };
  if (value === "HACKATON_EVALUADOR") return {
    pageWidth: basePageWidth, pageHeight: basePageHeight,
    nameBox: { x: 110, yFromTop: 275, width: 548, height: 38, size: 24 },
    detailBoxes: [{ x: 110, yFromTop: 335, width: 548, height: 28, size: 17 }]
  };
  if (value === "HACKATON_PREMIACION") return {
    pageWidth: basePageWidth, pageHeight: basePageHeight,
    nameBox: { x: 110, yFromTop: 260, width: 548, height: 38, size: 24 },
    detailBoxes: [
      { x: 110, yFromTop: 325, width: 548, height: 28, size: 17 },
      { x: 110, yFromTop: 365, width: 548, height: 28, size: 18 }
    ]
  };
  return { nameBox: standard, detailBoxes: [], pageWidth: basePageWidth, pageHeight: basePageHeight };
};

const $q = useQuasar();
const { confirmDelete } = useDeleteConfirmation();
const { isLight } = useThemeMode();
const { selectedCongressId: congresoId, selectedCongress } = useAdminCongreso();
const tipo = ref<ReconocimientoTipo>("GENERAL");
const imagen = ref<File | null>(null);
const imageUrl = ref<string | null>(null);
const pdfUrl = ref<string | null>(null);
const showPreview = ref(false);
const canvas = ref<HTMLElement | null>(null);
const layout = ref<Layout>(defaultLayout("GENERAL"));
const versions = ref<Version[]>([]);
const loadingVersions = ref(false);
const saving = ref(false);
const previewing = ref(false);
const imageLoading = ref(false);
const deletingId = ref<string | null>(null);
const previewSavedId = ref<string | null>(null);
const activatingId = ref<string | null>(null);
const busy = computed(() => saving.value || previewing.value || imageLoading.value || !!deletingId.value || !!activatingId.value);
const currentVersions = computed(() => versions.value.filter(item =>
  item.tipo === tipo.value && item.congreso.id === congresoId.value
));
const boxes = computed(() => [layout.value.nameBox, ...layout.value.detailBoxes]);

const notifyError = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message;
  $q.notify({ type: "negative", message: Array.isArray(message) ? message.join(". ") : message || fallback, position: "top" });
};
const revokeImage = () => { if (imageUrl.value) URL.revokeObjectURL(imageUrl.value); imageUrl.value = null; };
let imageRequest = 0;
const onImageChange = (file: File | null) => {
  const request = ++imageRequest;
  revokeImage();
  if (!file) return;
  imageLoading.value = true;
  const url = URL.createObjectURL(file);
  imageUrl.value = url;
  const probe = new Image();
  probe.onload = () => {
    if (request !== imageRequest) return;
    const next = pageSizeForImage(probe.naturalWidth, probe.naturalHeight);
    const previous = layout.value;
    const scaleX = next.pageWidth / previous.pageWidth;
    const scaleY = next.pageHeight / previous.pageHeight;
    const scaleBox = (box: Box): Box => {
      const width = Math.min(next.pageWidth, Math.max(20, box.width * scaleX));
      const height = Math.min(next.pageHeight, Math.max(12, box.height * scaleY));
      return {
        x: Math.min(box.x * scaleX, next.pageWidth - width),
        yFromTop: Math.min(box.yFromTop * scaleY, next.pageHeight - height),
        width, height,
        size: Math.min(48, Math.max(10, box.size * Math.min(scaleX, scaleY)))
      };
    };
    layout.value = {
      pageWidth: next.pageWidth,
      pageHeight: next.pageHeight,
      nameBox: scaleBox(previous.nameBox),
      detailBoxes: previous.detailBoxes.map(scaleBox)
    };
    imageLoading.value = false;
  };
  probe.onerror = () => {
    if (request !== imageRequest) return;
    imageLoading.value = false;
    imagen.value = null;
    revokeImage();
    $q.notify({ type: "negative", message: "No se pudo leer la imagen JPG.", position: "top" });
  };
  probe.src = url;
};
let versionRequest = 0;
const loadVersions = async () => {
  const request = ++versionRequest;
  if (!congresoId.value) { versions.value = []; loadingVersions.value = false; return; }
  loadingVersions.value = true;
  try {
    const result = await api.get<Version[]>("reconocimientos/plantillas", { params: { congresoId: congresoId.value } });
    if (request === versionRequest) versions.value = result.data;
  } catch (error) {
    if (request === versionRequest) notifyError(error, "No se pudieron cargar las plantillas.");
  } finally { if (request === versionRequest) loadingVersions.value = false; }
};
const resetEditor = () => {
  imageRequest++;
  imageLoading.value = false;
  imagen.value = null;
  revokeImage();
  layout.value = defaultLayout(tipo.value);
};
watch(congresoId, () => { resetEditor(); void loadVersions(); }, { immediate: true });
watch(tipo, () => { resetEditor(); });
onBeforeUnmount(() => { revokeImage(); if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value); removeDragListeners(); });

const formData = (withCongress: boolean) => {
  const form = new FormData();
  if (withCongress && congresoId.value) form.append("congresoId", congresoId.value);
  form.append("tipo", tipo.value);
  form.append("layout", JSON.stringify(layout.value));
  if (imagen.value) form.append("imagen", imagen.value);
  return form;
};
const preview = async () => {
  if (!imagen.value) return;
  previewing.value = true;
  try {
    const result = await api.post<Blob>("reconocimientos/plantillas/previsualizar", formData(false), {
      responseType: "blob", headers: { "Content-Type": "multipart/form-data" }
    });
    if (await result.data.slice(0, 5).text() !== "%PDF-")
      throw new Error("La respuesta no contiene un PDF válido");
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
    pdfUrl.value = URL.createObjectURL(new Blob([result.data], { type: "application/pdf" }));
    showPreview.value = true;
  } catch (error) { notifyError(error, "No se pudo crear la vista previa. Revisa la imagen y las posiciones."); }
  finally { previewing.value = false; }
};
const downloadPreview = () => {
  if (!pdfUrl.value) return;
  const link = document.createElement("a");
  link.href = pdfUrl.value;
  link.download = "vista-previa-reconocimiento.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
};
const downloadSavedPreview = async (version: Version) => {
  if (previewSavedId.value) return;
  previewSavedId.value = version.id;
  try {
    const result = await api.get<Blob>(`reconocimientos/plantillas/${version.id}/previsualizar`, {
      responseType: "blob"
    });
    if (await result.data.slice(0, 5).text() !== "%PDF-")
      throw new Error("La respuesta no contiene un PDF válido");
    const url = URL.createObjectURL(result.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reconocimiento-prueba-v${version.version}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    notifyError(error, "No se pudo generar el PDF de prueba.");
  } finally {
    previewSavedId.value = null;
  }
};
const save = async () => {
  if (!imagen.value || !congresoId.value) return;
  saving.value = true;
  try {
    const result = await api.post<Version>("reconocimientos/plantillas", formData(true), {
      headers: { "Content-Type": "multipart/form-data" }
    });
    await loadVersions();
    $q.notify({ type: "positive", message: `Versión ${result.data.version} guardada como borrador. Actívala cuando esté lista.`, position: "top" });
  } catch (error) { notifyError(error, "No se pudo guardar la plantilla."); }
  finally { saving.value = false; }
};
const deleteVersion = async (version: Version) => {
  if (busy.value) return;
  deletingId.value = version.id;
  try {
    const confirmed = await confirmDelete({
      title: `Eliminar versión ${version.version}`,
      message: version.activa
        ? "Esta versión está activa. Si ya tiene reconocimientos vinculados, primero debes activar otra. Al eliminarla, no podrás emitir hasta que actives una versión. ¿Deseas continuar?"
        : "Se eliminarán esta versión y su imagen JPG. ¿Deseas continuar?"
    });
    if (!confirmed) return;
    await api.delete(`reconocimientos/plantillas/${version.id}`);
    await loadVersions();
    $q.notify({ type: "positive", message: `Versión ${version.version} eliminada.`, position: "top" });
  } catch (error) { notifyError(error, "No se pudo eliminar la plantilla."); }
  finally { deletingId.value = null; }
};
const activate = async (version: Version) => {
  activatingId.value = version.id;
  try {
    await api.post(`reconocimientos/plantillas/${version.id}/activar`);
    await loadVersions();
    $q.notify({ type: "positive", message: `Versión ${version.version} activada para las próximas descargas.`, position: "top" });
  } catch (error) { notifyError(error, "No se pudo activar la plantilla."); }
  finally { activatingId.value = null; }
};

const sampleLabel = (index: number) => index === 0 ? "María José Hernández Pérez"
  : tipo.value === "HACKATON_EVALUADOR" ? "Participación como evaluador del Hackatón"
    : index === 1 ? "Equipo: Equipo de ejemplo" : "Primer lugar";
const fieldLabel = (index: number) => index === 0 ? "Nombre del destinatario"
  : tipo.value === "HACKATON_EVALUADOR" ? "Participación"
    : index === 1 ? "Nombre del equipo" : "Resultado";
const boxStyle = (box: Box) => ({
  left: `${box.x / layout.value.pageWidth * 100}%`, top: `${box.yFromTop / layout.value.pageHeight * 100}%`,
  width: `${box.width / layout.value.pageWidth * 100}%`, height: `${box.height / layout.value.pageHeight * 100}%`,
  fontSize: `${box.size / layout.value.pageWidth * 100}cqw`
});
const formatDate = (date: string) => new Date(date).toLocaleString("es-MX");

let dragIndex = -1;
let dragOffset = { x: 0, y: 0 };
const startDrag = (event: PointerEvent, index: number) => {
  if (!canvas.value) return;
  event.preventDefault();
  dragIndex = index;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dragOffset = { x: event.clientX - box.left, y: event.clientY - box.top };
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", removeDragListeners);
};
const moveDrag = (event: PointerEvent) => {
  if (dragIndex < 0 || !canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const box = boxes.value[dragIndex];
  if (!box) return;
  box.x = Math.round(Math.max(0, Math.min(layout.value.pageWidth - box.width,
    (event.clientX - rect.left - dragOffset.x) / rect.width * layout.value.pageWidth)) * 10) / 10;
  box.yFromTop = Math.round(Math.max(0, Math.min(layout.value.pageHeight - box.height,
    (event.clientY - rect.top - dragOffset.y) / rect.height * layout.value.pageHeight)) * 10) / 10;
};
const removeDragListeners = () => {
  dragIndex = -1;
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", removeDragListeners);
};
</script>

<style scoped>
.template-canvas { position: relative; width: 100%; overflow: hidden; container-type: inline-size; border: 1px solid var(--surface-border); border-radius: 8px; }
.template-canvas img { display: block; width: 100%; height: 100%; }
.template-box { position: absolute; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; color: #111; background: rgb(0 219 132 / 12%); border: 2px dashed #00b96e; cursor: grab; touch-action: none; font-weight: 700; }
.template-box:active { cursor: grabbing; }
.template-placeholder { min-height: 220px; display: grid; place-items: center; text-align: center; border: 1px dashed var(--surface-border); border-radius: 8px; color: var(--text-soft); }
.version-card { color: var(--text-strong); background: var(--surface-strong); }
.preview-dialog { width: 100vw; max-width: 100vw; height: 100vh; display: flex; flex-direction: column; color: #fff; background: #10241e; }
.preview-dialog--light { color: #24312d; background: #f1f5f2; }
.preview-bar { flex: none; min-height: 48px; color: inherit; background: rgba(0, 0, 0, .12); }
.preview-dialog--light .preview-bar { background: rgba(0, 0, 0, .06); }
.preview-content { flex: 1; overflow: auto; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 24px; }
.preview-canvas { position: relative; width: min(100%, 900px); container-type: inline-size; background: white; box-shadow: 0 8px 32px rgba(0, 0, 0, .25); }
.preview-canvas img { display: block; width: 100%; height: 100%; }
.preview-text { position: absolute; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; color: #111; font-weight: 700; }
</style>
