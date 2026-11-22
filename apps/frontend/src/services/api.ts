import axios from "axios";
import { sessionTokens } from "./sessionTokens";

const baseURL = import.meta.env.VITE_API_URL || "/api";

export const apiBaseUrl = baseURL.replace(/\/$/, "");

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  }
});

api.interceptors.request.use(config => {
  if (sessionTokens.personal)
    config.headers.set("x-csrf-token", sessionTokens.personal);
  if (sessionTokens.participante)
    config.headers.set("x-participante-csrf", sessionTokens.participante);
  return config;
});

api.interceptors.response.use(
  response => {
    const data = response.data as
      | { csrfTokenPersonal?: string; csrfTokenParticipante?: string }
      | undefined;
    if (typeof data?.csrfTokenPersonal === "string")
      sessionTokens.setPersonal(data.csrfTokenPersonal);
    if (typeof data?.csrfTokenParticipante === "string")
      sessionTokens.setParticipante(data.csrfTokenParticipante);
    return response;
  },
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.headers.get("x-csrf-token") &&
      !error.config.url?.startsWith("/login")
    ) {
      sessionTokens.setPersonal("");
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("personal-sesion-caducada"));
    }
    return Promise.reject(error);
  }
);

export function setAuthToken(token?: string) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

export default api;
