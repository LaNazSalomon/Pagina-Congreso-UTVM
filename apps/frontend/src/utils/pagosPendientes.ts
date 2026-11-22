import type { ParticipanteExterno, RegistroNsu } from '@/types';

export interface PagoPendiente {
  clave: string;
  tipo: 'Externo' | 'NSU';
  nombre: string;
  fecha: string;
  ruta: string;
  comprobanteId: string | null;
}

export function obtenerPagosPendientes(
  nsu: RegistroNsu[],
  externos: ParticipanteExterno[],
  congresoId: string | null,
): PagoPendiente[] {
  if (!congresoId) return [];

  const pendientesNsu = nsu.flatMap(registro =>
    (registro.participantes ?? [])
      .filter(participante =>
        participante.congresoId === congresoId &&
        (participante.estado_pago ?? 'PENDIENTE') === 'PENDIENTE' &&
        participante.correo_verificado,
      )
      .map(participante => ({
        clave: `NSU:${participante.id}`,
        tipo: 'NSU' as const,
        nombre: participante.nombre_completo,
        fecha: registro.created_at,
        ruta: `/participantes/nsu/${registro.id}`,
        comprobanteId: registro.comprobante?.id ?? null,
      })),
  );

  const pendientesExternos = externos
    .filter(externo =>
      externo.congresoId === congresoId &&
      externo.status === 'pendiente' &&
      externo.correoVerificado,
    )
    .map(externo => ({
      clave: `EXTERNO:${externo.id}`,
      tipo: 'Externo' as const,
      nombre: [externo.nombre, externo.apellidoPaterno, externo.apellidoMaterno]
        .filter(Boolean).join(' '),
      fecha: externo.createdAt,
      ruta: `/participantes?tab=externos&registro=${encodeURIComponent(externo.id)}`,
      comprobanteId: externo.comprobante?.id ?? null,
    }));

  return [...pendientesNsu, ...pendientesExternos]
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
