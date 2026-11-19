<template>
  <q-page class="q-pa-md">
    <div class="text-h4 text-weight-bold q-mb-xs">Pagos</div>
    <p class="text-secondary q-mb-lg">Configura tarifas y datos de pago para el congreso seleccionado.</p>

    <q-banner v-if="!selectedCongressId" rounded class="q-mb-md">
      Selecciona un congreso en la barra superior.
    </q-banner>

    <template v-else>
      <div class="text-subtitle1 q-mb-md">Congreso: <strong>{{ selectedCongress?.nombre }}</strong></div>
      <q-banner v-if="error" rounded class="bg-red-1 text-negative q-mb-md">{{ error }}</q-banner>
      <q-inner-loading :showing="loading" />

      <div class="row q-col-gutter-md">
        <div class="col-12">
          <q-card class="dashboard-card q-pa-md">
            <q-card-section>
              <div class="text-h6 q-mb-sm">Tarifas y cuenta de pago</div>
              <p class="text-caption">Los cambios de tarifa se aplican a registros nuevos. Los importes ya registrados se conservan.</p>
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-sm-6">
                  <q-input v-model.number="form.tarifa_externo" :dark="!isLight" outlined type="number" min="0.01" step="0.01" prefix="$" label="Externo por día (MXN)" />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input v-model.number="form.tarifa_nsu" :dark="!isLight" outlined type="number" min="0.01" step="0.01" prefix="$" label="NSU por día (MXN)" />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input v-model="form.banco" :dark="!isLight" outlined maxlength="120" label="Banco" />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input v-model="form.beneficiario" :dark="!isLight" outlined maxlength="160" label="Beneficiario" />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input v-model="form.numero_tarjeta" :dark="!isLight" outlined maxlength="16" inputmode="numeric" label="Tarjeta de débito (16 dígitos)" />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input v-model="form.clabe" :dark="!isLight" outlined maxlength="18" inputmode="numeric" label="CLABE (18 dígitos, opcional)" />
                </div>
                <div class="col-12">
                  <q-input v-model="form.concepto" :dark="!isLight" outlined maxlength="180" label="Concepto o referencia general" />
                </div>
              </div>
              <div class="row justify-end q-mt-md">
                <q-btn color="primary" icon="save" label="Guardar configuración" :loading="saving" :disable="loading" @click="save" />
              </div>
            </q-card-section>
          </q-card>
        </div>

      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { api } from '../../services/api';
import { useAdminCongreso } from '../../composables/useAdminCongreso';
import { useThemeMode } from '../../composables/useThemeMode';

type Data = {
  tarifas: { EXTERNO: number; NSU: number };
  banco: string | null; beneficiario: string | null; clabe: string | null; numero_tarjeta: string | null; concepto: string | null;
};
const $q = useQuasar();
const { selectedCongressId, selectedCongress } = useAdminCongreso();
const { isLight } = useThemeMode();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const form = ref({ tarifa_externo: 250, tarifa_nsu: 100, banco: '', beneficiario: '', clabe: '', numero_tarjeta: '', concepto: '' });
let requestId = 0;

async function load() {
  const id = selectedCongressId.value;
  const request = ++requestId;
  error.value = '';
  if (!id) return;
  loading.value = true;
  try {
    const { data } = await api.get<Data>(`pagos/${id}`);
    if (request !== requestId) return;
    form.value = {
      tarifa_externo: Number(data.tarifas.EXTERNO), tarifa_nsu: Number(data.tarifas.NSU),
      banco: data.banco ?? '', beneficiario: data.beneficiario ?? '',
      clabe: data.clabe ?? '', numero_tarjeta: data.numero_tarjeta ?? '', concepto: data.concepto ?? '',
    };
  } catch {
    if (request === requestId) error.value = 'No se pudo cargar la configuración de pagos.';
  } finally {
    if (request === requestId) loading.value = false;
  }
}
watch(selectedCongressId, () => { void load(); }, { immediate: true });

async function save() {
  if (!selectedCongressId.value || saving.value) return;
  if (![form.value.tarifa_externo, form.value.tarifa_nsu].every(value => Number.isFinite(Number(value)) && Number(value) >= 0.01)) {
    $q.notify({ type: 'warning', message: 'Introduce tarifas válidas.' }); return;
  }
  if (form.value.clabe && !/^\d{18}$/.test(form.value.clabe)) {
    $q.notify({ type: 'warning', message: 'La CLABE debe tener 18 dígitos.' }); return;
  }
  if (form.value.numero_tarjeta && !/^\d{16}$/.test(form.value.numero_tarjeta)) {
    $q.notify({ type: 'warning', message: 'La tarjeta de débito debe tener 16 dígitos.' }); return;
  }
  saving.value = true;
  try {
    await api.patch(`pagos/${selectedCongressId.value}`, {
      ...form.value, tarifa_externo: Number(form.value.tarifa_externo), tarifa_nsu: Number(form.value.tarifa_nsu),
    });
    $q.notify({ type: 'positive', message: 'Configuración de pagos guardada.' });
    await load();
  } catch { $q.notify({ type: 'negative', message: 'No se pudo guardar la configuración.' }); }
  finally { saving.value = false; }
}

</script>
