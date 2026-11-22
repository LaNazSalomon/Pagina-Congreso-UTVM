import { ref } from "vue";
import { isAxiosError } from "axios";
import { api } from "./api";
import { sessionTokens } from "./sessionTokens";

export type RolPersonal = "ADMINISTRADOR" | "VALIDADOR";
export interface UsuarioPersonal {
  id: string;
  nombre: string;
  correo: string;
  rol: RolPersonal;
  activo: boolean;
  correoVerificado: boolean;
  contrasenaConfigurada: boolean;
  cambiarContrasena: boolean;
  creadoEn: string;
}
export const usuarioPersonal = ref<UsuarioPersonal | null>(null);

export async function cargarSesionPersonal() {
  try {
    const { data } = await api.get<{ usuario: UsuarioPersonal }>(
      "/personal/sesion"
    );
    usuarioPersonal.value = data.usuario;
    return data.usuario;
  } catch (error) {
    usuarioPersonal.value = null;
    sessionTokens.setPersonal("");
    if (!isAxiosError(error) || error.response?.status !== 401) throw error;
    return null;
  }
}

export async function entrarPersonal(correo: string, contrasena: string) {
  const { data } = await api.post<{
    usuario?: UsuarioPersonal;
    requiereCambioContrasena?: boolean;
  }>("/personal/acceso/entrar", { correo, contrasena });
  usuarioPersonal.value = data.usuario ?? null;
  return data.usuario ?? null;
}

export async function cambiarContrasenaPersonal(
  correo: string,
  contrasena: string,
  nuevaContrasena: string
) {
  const { data } = await api.post<{ usuario: UsuarioPersonal }>(
    "/personal/acceso/cambiar-contrasena",
    { correo, contrasena, nuevaContrasena }
  );
  usuarioPersonal.value = data.usuario;
  return data.usuario;
}

export async function salirPersonal() {
  try {
    await api.post("/personal/cerrar-sesion");
  } catch (error) {
    if (!isAxiosError(error) || error.response?.status !== 401) throw error;
  }
  usuarioPersonal.value = null;
  sessionTokens.setPersonal("");
}

export function destinoPersonal(usuario: UsuarioPersonal, redirect?: unknown) {
  if (usuario.rol === "ADMINISTRADOR") return "/admin/dashboard";
  return typeof redirect === "string" &&
    /^\/acceso\/qr\/[A-Za-z0-9_-]{43}$/.test(redirect)
    ? redirect
    : "/validar";
}

export function errorPersonal(
  error: unknown,
  fallback = "No se pudo completar la operación."
) {
  const detalle = isAxiosError<{ message?: string | string[] }>(error)
    ? error.response?.data.message
    : undefined;
  return Array.isArray(detalle) ? detalle.join(", ") : detalle || fallback;
}
