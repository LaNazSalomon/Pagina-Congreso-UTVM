import { defineRouter } from "#q-app";
import routes from "./routes";
import {
  cargarSesionPersonal,
  destinoPersonal,
  usuarioPersonal
} from "../services/personalService";

import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory
} from "vue-router";

export default defineRouter((/* { store, ssrContext } */) => {
  normalizeLegacyQrHash();

  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === "history"
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE)
  });

  Router.beforeEach(async to => {
    const rol = to.meta.rolPersonal;
    if (!rol) return true;
    try {
      const usuario = await cargarSesionPersonal();
      if (!usuario)
        return { path: "/personal/acceso", query: { redirect: to.fullPath } };
      if (usuario.rol !== rol) return destinoPersonal(usuario);
      return true;
    } catch {
      return { path: "/personal/acceso", query: { redirect: to.fullPath } };
    }
  });
  if (typeof window !== "undefined") {
    window.addEventListener("personal-sesion-caducada", () => {
      usuarioPersonal.value = null;
      if (Router.currentRoute.value.meta.rolPersonal)
        void Router.replace({
          path: "/personal/acceso",
          query: { redirect: Router.currentRoute.value.fullPath }
        });
    });
  }

  return Router;
});

function normalizeLegacyQrHash(): void {
  if (typeof window === "undefined") return;

  const legacyPrefix = "#/acceso/qr/";
  if (!window.location.hash.startsWith(legacyPrefix)) return;

  const qrPath = window.location.hash.slice(1);
  window.history.replaceState(null, "", qrPath);
}
