import { computed, onMounted, ref } from "vue";
import { api } from "../services/api";

export interface DiaRegistro {
  id: string;
  fechaEvento: string;
  etiqueta: string;
}
export interface CongresoRegistro {
  id: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  dias: DiaRegistro[];
}

export function formatoFechaRegistro(fecha: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha)
    ? new Intl.DateTimeFormat("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(new Date(`${fecha}T12:00:00Z`))
    : fecha;
}

export function formatoDiasRegistro(dias: string[] | string) {
  return (Array.isArray(dias) ? dias : dias.split(","))
    .map(dia => formatoFechaRegistro(dia.trim()))
    .join(", ");
}

export function useDiasRegistro(tipo: "EXTERNO" | "NSU") {
  const congresos = ref<CongresoRegistro[]>([]);
  const congresoId = ref("");
  const cargandoDias = ref(false);
  const errorDias = ref("");
  const costoPorDia = ref(0);
  const congresoSeleccionado = computed(() =>
    congresos.value.find(item => item.id === congresoId.value)
  );
  const opcionesCongreso = computed(() =>
    congresos.value.map(item => ({
      label: `${item.nombre} · ${formatoFechaRegistro(item.fechaInicio)} al ${formatoFechaRegistro(item.fechaFin)}`,
      value: item.id
    }))
  );
  const diasOptions = computed(() =>
    (congresoSeleccionado.value?.dias ?? []).map(dia => ({
      value: dia.id,
      fecha: dia.fechaEvento,
      label: `${dia.etiqueta.replace(/^Dia /, "Día ")} — ${formatoFechaRegistro(dia.fechaEvento)}`
    }))
  );
  const cargarDias = async () => {
    cargandoDias.value = true;
    errorDias.value = "";
    try {
      const { data } = await api.get<{
        congresos: CongresoRegistro[];
        tarifas: { EXTERNO: number; NSU: number };
      }>("congresos/opciones-registro");
      congresos.value = data.congresos;
      costoPorDia.value = data.tarifas[tipo];
      if (!congresos.value.some(item => item.id === congresoId.value))
        congresoId.value = congresos.value[0]?.id ?? "";
      if (!congresos.value.length)
        errorDias.value = "No hay congresos abiertos para registro.";
    } catch {
      errorDias.value =
        "No se pudieron cargar las fechas del congreso. Intenta de nuevo.";
    } finally {
      cargandoDias.value = false;
    }
  };
  onMounted(cargarDias);
  return {
    congresos,
    congresoId,
    congresoSeleccionado,
    opcionesCongreso,
    diasOptions,
    costoPorDia,
    cargandoDias,
    errorDias,
    cargarDias
  };
}
