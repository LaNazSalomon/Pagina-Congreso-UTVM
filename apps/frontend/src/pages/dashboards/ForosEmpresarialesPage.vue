<template>
  <q-page class="hero-page q-pa-md">
    <div class="row justify-between items-center q-mb-lg">
      <div>
        <div class="text-h4 text-weight-bold">Foros empresariales</div>
        <div class="text-subtitle2 text-grey-7">
          Administra los foros empresariales del congreso.
        </div>
      </div>

      <div class="row items-center q-gutter-sm">
        <q-btn
          unelevated
          color="primary"
          icon="add"
          label="Nuevo foro"
          to="/foros-empresariales/nuevo"
        />
      </div>
    </div>

    <ForosEmpresarialesList
      :items="visibleForums"
      :is-refreshing="isRefreshing"
      :error="error"
      :deleting-id="deletingId"
      @delete="confirmRemove"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useQuasar } from "quasar";
import ForosEmpresarialesList from "../../components/list/ForosEmpresarialesList.vue";
import { useForosEmpresarialesQuery } from "../../composables/useForosEmpresarialesQuery";
import { useAdminCongreso } from "../../composables/useAdminCongreso";

const $q = useQuasar();
const { data, isRefreshing, error, load, remove } =
  useForosEmpresarialesQuery();
const { selectedCongressId } = useAdminCongreso();
const visibleForums = computed(() => data.value.filter(item =>
  item.congreso?.id === selectedCongressId.value
));
const deletingId = ref<string | null>(null);

const confirmRemove = (id: string) => {
  $q.dialog({
    title: "Eliminar foro empresarial",
    message: "¿Seguro que deseas eliminar este foro empresarial?",
    cancel: { label: "Cancelar", flat: true },
    persistent: true
  }).onOk(async () => {
    if (deletingId.value) return;

    deletingId.value = id;
    try {
      await remove(id);
      $q.notify({
        type: "positive",
        message: "Foro empresarial eliminado correctamente."
      });
      if (selectedCongressId.value) await load(selectedCongressId.value);
    } catch (removeError) {
      console.error(removeError);
      $q.notify({
        type: "negative",
        message: "No se pudo eliminar el foro empresarial."
      });
    } finally {
      deletingId.value = null;
    }
  });
};

onMounted(() => { if (selectedCongressId.value) void load(selectedCongressId.value); });
watch(selectedCongressId, id => { if (id) void load(id); });
</script>
