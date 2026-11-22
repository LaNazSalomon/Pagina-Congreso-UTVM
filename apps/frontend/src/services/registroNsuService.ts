import { api } from "./api";

export interface ParticipanteNsuPayload {
  nombreCompleto: string;
  correo: string;
  institucion: string;
  carrera: string;
  telefono: string;
  dias: string;
  diaEventoIds: string[];
  montoNumero: number;
}

export async function guardarRegistroNsu(
  participantes: ParticipanteNsuPayload[],
  comprobante: File,
  congresoId: string
) {
  const formData = new FormData();
  formData.append("congresoId", congresoId);

  formData.append("participantes", JSON.stringify(participantes));
  formData.append("comprobante", comprobante);

  const response = await api.post("/registro-nsu", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return response.data;
}

export async function verificarCorreoParticipante(token: string) {
  const response = await api.get(
    `/registro-nsu/verificar-correo/${encodeURIComponent(token)}`
  );

  return response.data;
}
