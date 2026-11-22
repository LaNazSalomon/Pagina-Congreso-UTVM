import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";

import { api } from "@/services/api";
import { contenidoOficialService } from "@/services/contenidoOficialService";
import type {
  ContenidoReferencia,
  NoticiaPublica
} from "@/types/contenido-oficial";

interface CongresoPublico extends ContenidoReferencia {
  fechaInicio?: string;
  fecha_inicio?: string;
}

// La misma edición (la de inicio más reciente) que muestran el inicio y el menú.
async function obtenerCongresoActual() {
  const { data } = await api.get<
    CongresoPublico[] | { data: CongresoPublico[] }
  >("congreso");
  const congresos = Array.isArray(data) ? data : data.data;
  return [...congresos].sort(
    (a, b) =>
      new Date(b.fechaInicio || b.fecha_inicio || "").getTime() -
      new Date(a.fechaInicio || a.fecha_inicio || "").getTime()
  )[0]?.id;
}

export function useNoticiasPublicas(
  congresoId: MaybeRefOrGetter<string | undefined>,
  seleccionarActual = false
) {
  const noticias = ref<NoticiaPublica[]>([]);
  const congreso = ref<ContenidoReferencia | null>(null);
  const cargando = ref(false);
  const error = ref("");
  const intento = ref(0);

  watch(
    [() => toValue(congresoId), intento],
    async ([id], _, onCleanup) => {
      let vigente = true;
      onCleanup(() => {
        vigente = false;
      });
      noticias.value = [];
      congreso.value = null;
      error.value = "";
      cargando.value = Boolean(id || seleccionarActual);
      if (!cargando.value) return;

      try {
        const seleccionado = id || (await obtenerCongresoActual());
        if (!vigente || !seleccionado) return;
        const pagina =
          await contenidoOficialService.getPaginaOficial(seleccionado);
        if (!vigente) return;
        noticias.value = pagina.noticias;
        congreso.value = pagina.congreso;
      } catch {
        if (vigente)
          error.value = "No pudimos cargar las noticias. Inténtalo de nuevo.";
      } finally {
        if (vigente) cargando.value = false;
      }
    },
    { immediate: true }
  );

  return {
    noticias,
    congreso,
    cargando,
    error,
    reintentar: () => {
      intento.value++;
    }
  };
}
