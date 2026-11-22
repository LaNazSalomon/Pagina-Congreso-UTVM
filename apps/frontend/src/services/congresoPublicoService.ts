import { api } from '@/services/api';

interface CongresoPublico {
  id: string;
  fechaInicio?: string;
  fecha_inicio?: string;
}

interface ListaCongresos {
  data: CongresoPublico[];
}

// La portada y el encabezado usan la edición con la fecha de inicio más reciente.
export async function obtenerCongresoPublicoActual(): Promise<string | null> {
  const { data } = await api.get<CongresoPublico[] | ListaCongresos>('congreso');
  const congresos = Array.isArray(data) ? data : data.data;

  return [...congresos].sort((a, b) =>
    (b.fechaInicio || b.fecha_inicio || '').localeCompare(
      a.fechaInicio || a.fecha_inicio || '',
    ),
  )[0]?.id ?? null;
}
