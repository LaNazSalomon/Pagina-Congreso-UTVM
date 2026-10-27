import { BadRequestException } from '@nestjs/common';
import { DiaEventoService } from './dia-evento.service';
import type { DiaEvento } from './entities/dia-evento.entity';

describe('DiaEventoService: fechas del registro', () => {
  const congresoId = '00000000-0000-4000-8000-000000000001';
  function setup() {
    const stored: DiaEvento[] = [];
    const congreso = {
      id: congresoId,
      nombre: 'Congreso de cinco días',
      fecha_inicio: new Date('2026-10-23T00:00:00Z'),
      fecha_fin: new Date('2026-10-27T23:59:00Z'),
    };
    const builder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([congreso]),
    };
    const save = jest.fn((items: DiaEvento[]) => {
      items.forEach((item) => {
        const index = stored.findIndex((day) => day.id === item.id && item.id);
        if (index >= 0) stored[index] = item;
        else
          stored.push({
            ...item,
            id: `00000000-0000-4000-8000-${String(stored.length + 2).padStart(12, '0')}`,
          });
      });
      return Promise.resolve(items);
    });
    const service = new DiaEventoService(
      {
        find: jest.fn(() => Promise.resolve([...stored])),
        create: jest.fn((item: DiaEvento) => item),
        save,
      } as never,
      {
        findOneBy: jest.fn().mockResolvedValue(congreso),
        createQueryBuilder: jest.fn(() => builder),
      } as never,
      { get: jest.fn().mockReturnValue('America/Mexico_City') } as never,
      {
        withLock: jest.fn((_key: string, callback: () => Promise<unknown>) =>
          callback(),
        ),
      } as never,
      {
        handle: jest.fn((error: Error) => {
          throw error;
        }),
      } as never,
    );
    return { service, stored, save, congreso };
  }

  it('ofrece todas las fechas de un congreso de más de tres días y no las duplica al recargar', async () => {
    const { service, save } = setup();
    const options = await service.opcionesRegistro();
    await service.opcionesRegistro();
    expect(options.congresos[0].dias.map((day) => day.fechaEvento)).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('devuelve las fechas canónicas de los IDs seleccionados en orden cronológico', async () => {
    const { service } = setup();
    const days = await service.generar(congresoId);
    await expect(
      service.validarSeleccion(congresoId, [days[4].id, days[1].id]),
    ).resolves.toMatchObject({
      fechas: ['2026-10-24', '2026-10-27'],
      diaEventoIds: [days[1].id, days[4].id],
    });
  });

  it('rechaza días que no pertenecen al congreso', async () => {
    const { service } = setup();
    await expect(
      service.validarSeleccion(congresoId, [
        '00000000-0000-4000-8000-000000000099',
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza fechas repetidas y selecciones vacías', async () => {
    const { service } = setup();
    const [day] = await service.generar(congresoId);
    await expect(
      service.validarSeleccion(congresoId, [day.id, day.id]),
    ).rejects.toThrow(BadRequestException);
    await expect(service.validarSeleccion(congresoId, [])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('no ofrece días que quedaron fuera de un periodo modificado', async () => {
    const { service, stored } = setup();
    await service.generar(congresoId);
    stored.push({ id: 'anterior', fecha_evento: '2026-10-22' } as DiaEvento);
    expect(
      (await service.findByCongreso(congresoId)).map((day) => day.fechaEvento),
    ).not.toContain('2026-10-22');
  });

  it('respeta el 14 de octubre a medianoche UTC y corrige las etiquetas existentes sin cambiar IDs', async () => {
    const { service, stored, congreso } = setup();
    congreso.fecha_inicio = new Date('2026-10-14T00:00:00.000Z');
    congreso.fecha_fin = new Date('2026-10-16T23:59:59.999Z');
    stored.push(
      {
        id: 'sobrante',
        fecha_evento: '2026-10-13',
        etiqueta: 'Dia 1',
      } as DiaEvento,
      {
        id: 'primero',
        fecha_evento: '2026-10-14',
        etiqueta: 'Dia 2',
      } as DiaEvento,
    );
    const { congresos } = await service.opcionesRegistro();
    expect(congresos[0]).toMatchObject({
      fechaInicio: '2026-10-14',
      fechaFin: '2026-10-16',
      dias: [
        { id: 'primero', fechaEvento: '2026-10-14', etiqueta: 'Dia 1' },
        { fechaEvento: '2026-10-15', etiqueta: 'Dia 2' },
        { fechaEvento: '2026-10-16', etiqueta: 'Dia 3' },
      ],
    });
    expect(stored.find((day) => day.id === 'primero')?.etiqueta).toBe('Dia 1');
  });

  it('no autoriza un día sobrante fuera del periodo aunque conserve su ID', async () => {
    const { congreso } = setup();
    const builder = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'sobrante', fecha_evento: '2026-10-22', congreso },
        ]),
    };
    const service = new DiaEventoService(
      { createQueryBuilder: jest.fn(() => builder) } as never,
      {} as never,
      { get: jest.fn().mockReturnValue('America/Mexico_City') } as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.findAuthorized(congresoId, ['sobrante']),
    ).rejects.toThrow(BadRequestException);
  });
});
