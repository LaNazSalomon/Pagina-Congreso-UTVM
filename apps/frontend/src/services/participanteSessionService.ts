import { isAxiosError } from "axios";
import { api } from "./api";
import type { LoginResponse } from "./loginService";
import { sessionTokens } from "./sessionTokens";

export async function cargarSesionParticipante() {
  const { data } = await api.get<LoginResponse>("/login/sesion");
  localStorage.setItem("participante", JSON.stringify(data.participante));
  localStorage.setItem("tipoParticipante", data.tipo);
  return data;
}

export async function salirParticipante() {
  try {
    await cargarSesionParticipante();
    await api.post("/login/cerrar-sesion");
  } catch (error) {
    if (!isAxiosError(error) || error.response?.status !== 401) throw error;
  }
  sessionTokens.setParticipante("");
  for (const key of ["participante", "tipoParticipante", "correoParticipante"])
    localStorage.removeItem(key);
}
