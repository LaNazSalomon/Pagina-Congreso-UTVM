<template>
  <q-page class="personal-page scanner-page">
    <q-card flat bordered class="personal-card personal-card--scanner">
      <q-card-section class="personal-card__intro">
        <span class="personal-card__icon"><q-icon name="qr_code_scanner" size="34px" /></span>
        <span class="personal-card__eyebrow">CONTROL DE ACCESO</span>
        <h1>Escanear QR de acceso</h1>
        <p class="personal-card__description"
          >Apunta al QR del participante. Después podrás revisar sus datos y
          confirmar la entrada.</p
        ></q-card-section
      >
      <q-card-section class="personal-card__content">
        <q-banner
          v-if="error"
          class="bg-red-1 text-negative q-mb-md"
          rounded
          role="alert"
          >{{ error }}</q-banner
        >
        <video
          ref="video"
          v-show="camaraActiva"
          autoplay
          playsinline
          muted
          class="scanner-video"
          aria-label="Vista de la cámara para escanear QR"
        />
        <q-btn
          class="personal-primary-btn full-width q-mt-md"
          :icon="camaraActiva ? 'stop' : 'photo_camera'"
          :label="camaraActiva ? 'Detener cámara' : 'Activar cámara'"
          :loading="iniciando"
          no-caps
          @click="camaraActiva ? detener() : iniciar()"
        />
      </q-card-section>
      <q-separator class="personal-separator" />
      <q-card-section class="personal-card__content personal-card__content--secondary">
        <q-form @submit="abrir(codigo)" class="personal-form">
          <q-input
            v-model.trim="codigo"
            outlined
            :dark="!isLight"
            class="personal-field"
            label="Enlace o código QR"
            hint="También puedes pegar el enlace o usar un lector externo."
          />
          <q-btn
            type="submit"
            outline
            label="Revisar QR"
            no-caps
            class="personal-outline-btn full-width"
            :disable="!codigo || iniciando"
          />
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>
<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import jsQR from "jsqr";
import { useThemeMode } from "../composables/useThemeMode";
import { extraerTokenQr } from "../services/qrScan";
const router = useRouter();
const { isLight } = useThemeMode();
const video = ref<HTMLVideoElement | null>(null);
const camaraActiva = ref(false);
const iniciando = ref(false);
const error = ref("");
const codigo = ref("");
let stream: MediaStream | null = null;
let frame = 0;
let cerrado = false;
let ultimaLectura = 0;
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
onUnmounted(() => {
  cerrado = true;
  detener();
});
function detener() {
  cancelAnimationFrame(frame);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  camaraActiva.value = false;
  if (video.value) video.value.srcObject = null;
}
async function iniciar() {
  if (iniciando.value) return;
  iniciando.value = true;
  error.value = "";
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "La cámara necesita una conexión HTTPS o localhost. También puedes pegar el enlace del QR."
      );
    const nueva = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }
    });
    if (cerrado || !video.value) {
      nueva.getTracks().forEach(track => track.stop());
      return;
    }
    stream = nueva;
    video.value.srcObject = stream;
    await video.value.play();
    camaraActiva.value = true;
    frame = requestAnimationFrame(leer);
  } catch (err) {
    detener();
    error.value =
      err instanceof Error && err.name !== "NotAllowedError"
        ? err.message
        : "Permite el acceso a la cámara o pega el enlace del QR.";
  } finally {
    iniciando.value = false;
  }
}
function leer(now: number) {
  if (!camaraActiva.value || !video.value || !context) return;
  if (now - ultimaLectura >= 180 && video.value.readyState >= 2) {
    ultimaLectura = now;
    const width = Math.min(video.value.videoWidth, 720);
    const height = Math.round(
      (width * video.value.videoHeight) / video.value.videoWidth
    );
    if (width && height) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video.value, 0, 0, width, height);
      const found = jsQR(
        context.getImageData(0, 0, width, height).data,
        width,
        height,
        { inversionAttempts: "attemptBoth" }
      );
      if (found) {
        abrir(found.data);
        return;
      }
    }
  }
  frame = requestAnimationFrame(leer);
}
function abrir(value: string) {
  const token = extraerTokenQr(value);
  if (!token) {
    error.value = "El código no corresponde a un QR de acceso del congreso.";
    detener();
    return;
  }
  detener();
  void router.push(`/acceso/qr/${token}`);
}
</script>
<style scoped>
.scanner-video {
  width: 100%;
  max-height: 440px;
  border-radius: 12px;
  background: #132c25;
  object-fit: cover;
}
</style>
