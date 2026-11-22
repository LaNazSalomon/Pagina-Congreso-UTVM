import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Reconocimiento } from '../../reconocimiento/entities/reconocimiento.entity';
import { Hackaton } from '../entities/hackaton.entity';
import { HackatonEvaluador } from '../entities/hackaton-evaluador.entity';
import { HackatonReconocimientosService } from './hackaton-reconocimientos.service';

interface InsertBuilder {
  insert: jest.Mock;
  values: jest.Mock<InsertBuilder, [Partial<Reconocimiento>]>;
  orIgnore: jest.Mock;
  execute: jest.Mock<Promise<void>, []>;
}

describe('HackatonReconocimientosService: evaluadores', () => {
  function setup() {
    const hackaton = {
      id: 'hackaton',
      nombre: 'Hackatón de prueba',
      fecha_fin: '2020-01-01',
      congreso: { id: 'congreso' },
      evaluadores: [
        { id: 'asignacion-ana', ponente: { id: 'ana', nombre: 'Ana Pérez' } },
        {
          id: 'asignacion-luis',
          ponente: { id: 'luis', nombre: 'Luis López' },
        },
      ],
    };
    const stored = new Map<string, Reconocimiento>();
    const scopedIds = jest.fn().mockReturnThis();
    const execute = jest.fn().mockResolvedValue(undefined);
    const assignmentRepository = {
      findOne: jest.fn(
        (query: { where: { id: string; hackaton: { id: string } } }) => {
          const assignment = hackaton.evaluadores.find(
            (item) => item.id === query.where.id,
          );
          return Promise.resolve(
            query.where.hackaton.id === hackaton.id && assignment
              ? { ...assignment, hackaton }
              : null,
          );
        },
      ),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        whereInIds: scopedIds,
        andWhere: jest.fn().mockReturnThis(),
        execute,
      })),
    };
    const recognitionRepository = {
      createQueryBuilder: jest.fn(() => {
        let value: Partial<Reconocimiento>;
        const builder: InsertBuilder = {
          insert: jest.fn().mockReturnThis(),
          values: jest.fn((data: Partial<Reconocimiento>) => {
            value = data;
            return builder;
          }),
          orIgnore: jest.fn().mockReturnThis(),
          execute: jest.fn(() => {
            if (!stored.has(value.clave_emision!))
              stored.set(value.clave_emision!, {
                id: `rec-${stored.size}`,
                ...value,
              } as Reconocimiento);
            return Promise.resolve();
          }),
        };
        return builder;
      }),
      findOneByOrFail: jest.fn(({ clave_emision }: { clave_emision: string }) =>
        Promise.resolve(stored.get(clave_emision)),
      ),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const renderer = {
      render: jest.fn().mockResolvedValue(Buffer.from('%PDF-prueba')),
    };
    const cached = new Map<string, Buffer>();
    const recognitionService = {
      generatePdf: jest.fn(async (id: string) => {
        let pdf = cached.get(id);
        if (!pdf) {
          pdf = (await renderer.render(id)) as Buffer;
          cached.set(id, pdf);
        }
        return { pdf };
      }),
    };
    const service = new HackatonReconocimientosService(
      {
        getRepository: jest.fn((entity: unknown) => {
          if (entity === Hackaton)
            return { findOne: jest.fn().mockResolvedValue(hackaton) };
          if (entity === HackatonEvaluador) return assignmentRepository;
          throw new Error('Repositorio inesperado');
        }),
      } as never,
      recognitionRepository as never,
      recognitionService as never,
      {} as never,
    );
    return {
      service,
      hackaton,
      stored,
      scopedIds,
      renderer,
      execute,
      recognitionRepository,
      assignmentRepository,
    };
  }

  it('permite descargar el ZIP repetidamente sin duplicar reconocimientos', async () => {
    const { service, stored, renderer } = setup();

    const first = await service.evaluadoresZip('hackaton');
    const second = await service.evaluadoresZip('hackaton');

    expect(first.zip.readUInt16LE(first.zip.length - 14)).toBe(2);
    expect(second.zip.readUInt16LE(second.zip.length - 14)).toBe(2);
    expect(second.zip.toString()).toContain('Ana-Perez.pdf');
    expect(stored.size).toBe(2);
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it('incluye los evaluadores agregados después de la primera descarga y del cierre', async () => {
    const { service, hackaton, stored, scopedIds } = setup();
    await service.evaluadoresZip('hackaton');
    hackaton.evaluadores.push({
      id: 'asignacion-maria',
      ponente: { id: 'maria', nombre: 'María' },
    });

    const result = await service.evaluadoresZip('hackaton');

    expect(result.zip.readUInt16LE(result.zip.length - 14)).toBe(3);
    expect(result.zip.toString()).toContain('Maria.pdf');
    expect(stored.size).toBe(3);
    expect(scopedIds).toHaveBeenLastCalledWith([
      'asignacion-ana',
      'asignacion-luis',
      'asignacion-maria',
    ]);
  });

  it('genera y vuelve a descargar un PDF individual sin emitir los de otros evaluadores', async () => {
    const { service, stored, scopedIds, renderer } = setup();

    const first = await service.evaluadorPdf('hackaton', 'asignacion-ana');
    const second = await service.evaluadorPdf('hackaton', 'asignacion-ana');

    expect(first).toEqual({
      pdf: Buffer.from('%PDF-prueba'),
      filename: 'Ana-Perez.pdf',
    });
    expect(second.pdf.toString()).toBe('%PDF-prueba');
    expect(stored.size).toBe(1);
    expect(scopedIds).toHaveBeenLastCalledWith(['asignacion-ana']);
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('rechaza un evaluador de otro Hackatón', async () => {
    const { service, renderer } = setup();

    await expect(
      service.evaluadorPdf('otro', 'asignacion-ana'),
    ).rejects.toThrow(NotFoundException);

    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('permite reintentar un PDF fallido sin marcar la asignación como emitida antes de tiempo', async () => {
    const { service, renderer, execute, stored } = setup();
    renderer.render.mockRejectedValueOnce(new Error('fallo de render'));

    await expect(
      service.evaluadorPdf('hackaton', 'asignacion-ana'),
    ).rejects.toThrow(InternalServerErrorException);
    expect(execute).not.toHaveBeenCalled();

    await expect(
      service.evaluadorPdf('hackaton', 'asignacion-ana'),
    ).resolves.toMatchObject({ filename: 'Ana-Perez.pdf' });
    expect(stored.size).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('no marca como emitidos evaluadores agregados mientras se genera un ZIP', async () => {
    const { service, renderer, hackaton, scopedIds } = setup();
    renderer.render.mockImplementationOnce(() => {
      hackaton.evaluadores = [
        ...hackaton.evaluadores,
        { id: 'nuevo', ponente: { id: 'nuevo', nombre: 'Nuevo' } },
      ];
      return Promise.resolve(Buffer.from('%PDF-prueba'));
    });

    await service.evaluadoresZip('hackaton');

    expect(scopedIds).toHaveBeenCalledWith([
      'asignacion-ana',
      'asignacion-luis',
    ]);
  });
});
