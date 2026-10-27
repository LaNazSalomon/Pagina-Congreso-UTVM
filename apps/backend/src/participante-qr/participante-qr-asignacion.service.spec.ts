import { BadRequestException } from '@nestjs/common';
import { ParticipanteQrAsignacionService } from './participante-qr-asignacion.service';

describe('ParticipanteQrAsignacionService', () => {
  function setup() {
    const days = Array.from({ length: 5 }, (_, index) => ({
      id: `id-${index + 1}`,
      fechaEvento: `2026-10-${23 + index}`,
      etiqueta: `Dia ${index + 1}`,
    }));
    const builder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'original' }),
    };
    const service = new ParticipanteQrAsignacionService(
      { createQueryBuilder: jest.fn(() => builder) } as never,
      { generar: jest.fn().mockResolvedValue(days) } as never,
    );
    return { service, days, builder };
  }

  it('usa el congreso y los IDs guardados aunque el próximo congreso cambie', async () => {
    const { service, builder } = setup();
    await expect(
      service.resolver(['texto antiguo'], {
        congresoId: 'original',
        diaEventoIds: ['id-2', 'id-5'],
      }),
    ).resolves.toEqual({
      congresoId: 'original',
      diaEventoIds: ['id-2', 'id-5'],
    });
    expect(builder.where).toHaveBeenCalledWith('congreso.id = :id', {
      id: 'original',
    });
  });

  it('resuelve fechas ISO como fechas completas y no como ordinales', async () => {
    const { service } = setup();
    await expect(
      service.resolver('2026-10-23,2026-10-27'),
    ).resolves.toMatchObject({ diaEventoIds: ['id-1', 'id-5'] });
    await expect(service.resolver('2026-11-23')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('mantiene la interpretación de los valores antiguos', async () => {
    const { service } = setup();
    await expect(service.resolver('dia1, Día 3,dia_5')).resolves.toMatchObject({
      diaEventoIds: ['id-1', 'id-3', 'id-5'],
    });
  });

  it('autoriza todos los días para EMS/UTVM cuando no hay selección de pago', async () => {
    const { service } = setup();
    await expect(service.resolver()).resolves.toMatchObject({
      diaEventoIds: ['id-1', 'id-2', 'id-3', 'id-4', 'id-5'],
    });
  });

  it('rechaza una selección guardada que ya no pertenece al periodo', async () => {
    const { service } = setup();
    await expect(
      service.resolver([], {
        congresoId: 'original',
        diaEventoIds: ['id-ajeno'],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
