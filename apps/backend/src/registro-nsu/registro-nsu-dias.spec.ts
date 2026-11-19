import { RegistroNsuService } from './registro-nsu.service';
import { REGISTRO_TARIFAS } from '../dia-evento/registro-tarifas.constant';

describe('Registro NSU: fechas e importe', () => {
  it('valida el importe según la selección canónica antes de subir el comprobante', async () => {
    const comprobantes = { create: jest.fn() };
    const service = new RegistroNsuService(
      {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      comprobantes as never,
      {
        tarifa: jest.fn().mockResolvedValue(REGISTRO_TARIFAS.NSU),
        validarSeleccion: jest.fn().mockResolvedValue({
          congresoId: 'congreso',
          diaEventoIds: ['primero', 'segundo'],
          fechas: ['2026-10-18', '2026-10-19'],
        }),
      } as never,
    );
    await expect(
      service.create({
        congresoId: 'congreso',
        comprobante: {} as never,
        participantes: [
          {
            nombreCompleto: 'Prueba',
            correo: 'prueba@example.com',
            institucion: 'UTVM',
            carrera: 'TI',
            telefono: '5512345678',
            dias: '2026-10-18,2026-10-19',
            diaEventoIds: ['primero', 'segundo'],
            montoNumero: REGISTRO_TARIFAS.NSU,
          },
        ],
      }),
    ).rejects.toThrow('no coincide');
    expect(comprobantes.create).not.toHaveBeenCalled();
  });
});
