import { ref } from "vue";
import { api } from "../services/api";
import type {
  Reconocimiento,
  ReconocimientoEstado,
  ReconocimientoTipo,
  ReconocimientosPage
} from "../types";

interface ReconocimientoFilters {
  congresoId?: string;
  tallerId?: string;
  conferenciaId?: string;
  tipo?: ReconocimientoTipo;
  estado?: ReconocimientoEstado;
}

const filenameFromHeader = (header?: string) => {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? "reconocimiento.pdf";
};

export function useReconocimientosQuery() {
  const data = ref<Reconocimiento[]>([]);
  const total = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  let loadRequest = 0;

  const load = async (filters: ReconocimientoFilters = {}) => {
    const request = ++loadRequest;
    isLoading.value = true;
    error.value = null;

    try {
      const response = await api.get<ReconocimientosPage>("reconocimientos", {
        params: {
          ...(filters.congresoId ? { congresoId: filters.congresoId } : {}),
          ...(filters.tipo ? { tipo: filters.tipo } : {}),
          limit: 100,
          ...(filters.tallerId ? { tallerId: filters.tallerId } : {}),
          ...(filters.conferenciaId
            ? { conferenciaId: filters.conferenciaId }
            : {}),
          ...(filters.estado ? { estado: filters.estado } : {})
        }
      });
      if (request === loadRequest) {
        data.value = response.data.data;
        total.value = response.data.total;
      }
    } catch (loadError) {
      console.error(loadError);
      if (request === loadRequest) error.value = "No se pudieron cargar los reconocimientos.";
    } finally {
      if (request === loadRequest) isLoading.value = false;
    }
  };

  const download = async (reconocimiento: Reconocimiento) => {
    const response = await api.get<Blob>(
      `reconocimientos/${reconocimiento.id}/pdf`,
      { responseType: "blob" }
    );
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filenameFromHeader(
      response.headers["content-disposition"]
    );
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const prepareForTaller = async (tallerId: string) => {
    await api.post(`reconocimientos/taller/${tallerId}/preparar`);
  };

  const prepareForConferencia = async (conferenciaId: string) => {
    await api.post(`reconocimientos/conferencia/${conferenciaId}/preparar`);
  };

  return {
    data,
    total,
    isLoading,
    error,
    load,
    download,
    prepareForTaller,
    prepareForConferencia
  };
}
