<template>
  <div>
    <div class="text-h6">Agregar evaluadores</div>
    <p class="text-secondary q-mt-xs">
      Puedes agregar evaluadores incluso después de finalizar el Hackatón. Sus
      reconocimientos estarán disponibles individualmente y en el ZIP.
    </p>
    <q-select
      v-model="form.ids"
      :options="availableOptions"
      option-value="id"
      option-label="nombre"
      emit-value
      map-options
      multiple
      use-chips
      dense
      :dark="!isLight"
      label="Evaluadores por agregar"
      hint="Selecciona perfiles registrados con tipo Evaluador"
      :disable="working"
    />

    <div class="row justify-end q-gutter-sm q-mt-md">
      <q-btn
        flat
        color="primary"
        icon="refresh"
        label="Actualizar perfiles"
        :disable="working"
        @click="$emit('refreshProfiles')"
      />
      <q-btn
        unelevated
        color="primary"
        icon="person_add"
        label="Agregar evaluadores"
        :loading="loading"
        :disable="working || !selectedIds.length"
        @click="$emit('add', selectedIds)"
      />
    </div>

    <q-separator class="q-my-lg" />

    <div class="row items-center justify-between q-gutter-sm q-mb-md">
      <div>
        <div class="text-h6">Evaluadores asignados</div>
        <div class="text-caption text-secondary">
          Descarga los reconocimientos cuantas veces lo necesites. El ZIP
          incluye todos los evaluadores guardados.
        </div>
      </div>
      <q-btn
        outline
        color="primary"
        icon="folder_zip"
        label="Descargar ZIP de evaluadores"
        :loading="downloading === 'evaluators'"
        :disable="working || !assignments.length"
        @click="$emit('download')"
      />
    </div>

    <q-list bordered separator class="admin-list rounded-borders">
      <q-item v-for="item in assignments" :key="item.id">
        <q-item-section>
          <q-item-label>{{ item.ponente.nombre }}</q-item-label>
          <q-item-label caption>{{ item.ponente.institucion }}</q-item-label>
          <q-item-label caption>
            {{
              item.bloqueado
                ? "Reconocimiento emitido"
                : "Reconocimiento por generar"
            }}
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row items-center q-gutter-xs">
            <q-btn
              flat
              color="primary"
              icon="picture_as_pdf"
              label="Descargar PDF"
              :loading="downloading === `evaluator:${item.id}`"
              :disable="working"
              :aria-label="`Descargar reconocimiento de ${item.ponente.nombre}`"
              @click="$emit('downloadIndividual', item.id)"
            />
            <q-btn
              v-if="!item.bloqueado"
              flat
              round
              color="negative"
              icon="person_remove"
              :disable="working"
              :aria-label="`Quitar a ${item.ponente.nombre}`"
              @click="$emit('remove', item.id)"
            >
              <q-tooltip>Quitar evaluador</q-tooltip>
            </q-btn>
          </div>
        </q-item-section>
      </q-item>
      <q-item v-if="!assignments.length">
        <q-item-section class="text-secondary">
          Aún no hay evaluadores asignados. Agrégalos para generar sus
          reconocimientos.
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useFormPersistence } from "../../composables/useFormPersistence";
import { useThemeMode } from "../../composables/useThemeMode";
import type { HackatonEvaluador, Ponente } from "../../types";

const props = defineProps<{
  options: Ponente[];
  assignments: HackatonEvaluador[];
  loading: boolean;
  downloading: string | null;
  persistenceKey: string;
}>();
defineEmits<{
  add: [ids: string[]];
  remove: [id: string];
  download: [];
  downloadIndividual: [id: string];
  refreshProfiles: [];
}>();
const { isLight } = useThemeMode();
const { formData: form, clearForm } = useFormPersistence(
  `${props.persistenceKey}-add`,
  {
    ids: [] as string[]
  }
);
const working = computed(() => props.loading || props.downloading !== null);
const assignedIds = computed(
  () => new Set(props.assignments.map(item => item.ponente.id))
);
const availableOptions = computed(() =>
  props.options.filter(item => !assignedIds.value.has(item.id))
);
const selectedIds = computed(() =>
  [...new Set(form.value.ids)].filter(id =>
    availableOptions.value.some(item => item.id === id)
  )
);

watch(
  () => props.assignments,
  () => {
    form.value.ids = form.value.ids.filter(id => !assignedIds.value.has(id));
  },
  { deep: true }
);

const clearDraft = () => clearForm();
defineExpose({ clearDraft });
</script>
