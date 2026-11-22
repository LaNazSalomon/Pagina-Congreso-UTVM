import { computed, ref, watch } from "vue";
import { congresosRevision, useCongresosQuery } from "./useCongresosQuery";

const storageKey = "admin-congreso-id";
const { data: congresos, isRefreshing, error, load } = useCongresosQuery();
const selectedCongressId = ref<string | null>(
  typeof window === "undefined" ? null : sessionStorage.getItem(storageKey)
);
const sortedCongresses = computed(() =>
  [...congresos.value].sort((a, b) =>
    (b.fechaInicio || "").localeCompare(a.fechaInicio || "")
  )
);
const selectedCongress = computed(() =>
  congresos.value.find(item => item.id === selectedCongressId.value) ?? null
);
let pendingLoad: Promise<void> | null = null;
const loadCongresos = () => {
  if (pendingLoad) return pendingLoad;
  pendingLoad = load().finally(() => { pendingLoad = null; });
  return pendingLoad;
};

watch(congresos, () => {
  if (!congresos.value.some(item => item.id === selectedCongressId.value)) {
    selectedCongressId.value = sortedCongresses.value[0]?.id ?? null;
  }
});

watch(selectedCongressId, id => {
  if (typeof window === "undefined") return;
  if (id) sessionStorage.setItem(storageKey, id);
  else sessionStorage.removeItem(storageKey);
});

watch(congresosRevision, () => void loadCongresos());

export function useAdminCongreso() {
  return {
    congresos,
    sortedCongresses,
    selectedCongressId,
    selectedCongress,
    isRefreshing,
    error,
    load: loadCongresos
  };
}
