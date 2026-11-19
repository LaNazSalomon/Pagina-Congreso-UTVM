import { ref } from "vue";
import { api } from "../services/api";
import type { Hackaton, HackatonPayload, HackatonResultado } from "../types";

const filename = (header: string | undefined, fallback: string) =>
  header?.match(/filename="?([^";]+)"?/)?.[1] ?? fallback;
const saveBlob = (data: BlobPart, name: string, type = "application/zip") => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
export function useHackatones() {
  const items = ref<Hackaton[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let loadRequest = 0;
  const load = async (congresoId?: string) => {
    const request = ++loadRequest;
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get("hackatones", { params: { limit: 100, ...(congresoId ? { congresoId } : {}) } });
      if (request === loadRequest) items.value = data.data;
    } catch {
      if (request === loadRequest) error.value = "No se pudieron cargar los Hackatones.";
    } finally {
      if (request === loadRequest) loading.value = false;
    }
  };
  const get = async (id: string) =>
    (await api.get<Hackaton>(`hackatones/${id}`)).data;
  const create = async (payload: HackatonPayload) =>
    (await api.post<Hackaton>("hackatones", payload)).data;
  const update = async (id: string, payload: HackatonPayload) =>
    (await api.patch<Hackaton>(`hackatones/${id}`, payload)).data;
  const remove = async (id: string) => api.delete(`hackatones/${id}`);
  const replaceEvaluators = async (id: string, ids: string[]) =>
    api.put(`hackatones/${id}/evaluadores`, { ponente_ids: ids });
  const addEvaluators = async (id: string, ids: string[]) =>
    api.post(`hackatones/${id}/evaluadores`, { ponente_ids: ids });
  const eligible = async (id: string) =>
    (
      await api.get(`hackatones/${id}/participantes-elegibles`, {
        params: { limit: 100 }
      })
    ).data.data;
  const saveTeam = async (
    hid: string,
    id: string | null,
    body: { nombre: string; participante_ids: string[] }
  ) =>
    id
      ? api.put(`hackatones/${hid}/equipos/${id}`, body)
      : api.post(`hackatones/${hid}/equipos`, body);
  const deleteTeam = async (hid: string, id: string) =>
    api.delete(`hackatones/${hid}/equipos/${id}`);
  const result = async (
    hid: string,
    id: string,
    value: HackatonResultado | null
  ) =>
    api.put(`hackatones/${hid}/equipos/${id}/resultado`, { resultado: value });
  const downloadEvaluators = async (id: string) => {
    const r = await api.post(
      `hackatones/${id}/reconocimientos/evaluadores/zip`,
      {},
      { responseType: "blob" }
    );
    saveBlob(
      r.data,
      filename(r.headers["content-disposition"], "evaluadores.zip")
    );
  };
  const downloadTeam = async (hid: string, id: string) => {
    const r = await api.post(
      `hackatones/${hid}/equipos/${id}/reconocimientos/zip`,
      {},
      { responseType: "blob" }
    );
    saveBlob(
      r.data,
      filename(r.headers["content-disposition"], "premiacion.zip")
    );
  };
  const downloadEvaluator = async (hid: string, id: string) => {
    const r = await api.post(
      `hackatones/${hid}/evaluadores/${id}/reconocimiento/pdf`,
      {},
      { responseType: "blob" }
    );
    saveBlob(
      r.data,
      filename(
        r.headers["content-disposition"],
        "reconocimiento-evaluador.pdf"
      ),
      "application/pdf"
    );
  };
  return {
    items,
    loading,
    error,
    load,
    get,
    create,
    update,
    remove,
    replaceEvaluators,
    addEvaluators,
    eligible,
    saveTeam,
    deleteTeam,
    result,
    downloadEvaluators,
    downloadEvaluator,
    downloadTeam
  };
}
