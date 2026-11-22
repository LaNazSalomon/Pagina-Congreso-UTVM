import { ref } from "vue";
import { api } from "../services/api";
import type { ForoEmpresarial, ForoEmpresarialPayload } from "../types";

export function useForosEmpresarialesQuery() {
  const data = ref<ForoEmpresarial[]>([]);
  const isRefreshing = ref(false);
  const error = ref<string | null>(null);
  let loadRequest = 0;

  const load = async (congresoId?: string) => {
    const request = ++loadRequest;
    isRefreshing.value = true;
    error.value = null;

    try {
      const response = await api.get<ForoEmpresarial[]>("foro-empresarial", {
        params: congresoId ? { congresoId } : undefined
      });
      if (request === loadRequest) data.value = response.data;
    } catch (loadError) {
      if (request === loadRequest) error.value = "No se pudieron cargar los foros empresariales.";
      console.error(loadError);
    } finally {
      if (request === loadRequest) isRefreshing.value = false;
    }
  };

  const getById = async (id: string) =>
    (await api.get<ForoEmpresarial>(`foro-empresarial/${id}`)).data;

  const create = async (payload: ForoEmpresarialPayload) =>
    (await api.post<ForoEmpresarial>("foro-empresarial", payload)).data;

  const update = async (id: string, payload: Partial<ForoEmpresarialPayload>) =>
    (await api.patch<ForoEmpresarial>(`foro-empresarial/${id}`, payload)).data;

  const remove = async (id: string) =>
    api.delete<string>(`foro-empresarial/${id}`);

  return { data, isRefreshing, error, load, getById, create, update, remove };
}
