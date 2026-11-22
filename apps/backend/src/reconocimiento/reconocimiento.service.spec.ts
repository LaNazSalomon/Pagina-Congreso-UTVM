/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ReconocimientoEstado } from './enums/reconocimiento-estado.enum';
import { ReconocimientoTipo } from './enums/reconocimiento-tipo.enum';
import { ReconocimientoService } from './reconocimiento.service';

describe('ReconocimientoService', () => {
  function setup(
    estado: ReconocimientoEstado = ReconocimientoEstado.PENDIENTE,
  ) {
    const reconocimiento = {
      id: 'rec-1',
      congreso: { id: 'congreso-1' },
      tipo: ReconocimientoTipo.GENERAL,
      estado,
      primera_fecha_emision:
        estado === ReconocimientoEstado.EMITIDO ? new Date() : null,
      nombre_destinatario: 'María Pérez',
      plantilla: null as null | Record<string, unknown>,
      render_context: null as null | Record<string, unknown>,
    };
    const set = jest.fn().mockReturnThis();
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-prueba'));
    const findActive = jest.fn().mockResolvedValue({
      id: 'plantilla-activa',
      layout: { nameBox: {}, detailBoxes: [] },
    });
    const loadImage = jest.fn().mockResolvedValue(Buffer.from('jpg'));
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set,
      execute: jest.fn(() => {
        const last = (set.mock.calls as Array<[Record<string, unknown>]>).at(
          -1,
        )?.[0];
        if (last?.estado)
          reconocimiento.estado = last.estado as ReconocimientoEstado;
        if (last?.plantilla)
          reconocimiento.plantilla = last.plantilla as Record<string, unknown>;
        if (last?.render_context)
          reconocimiento.render_context = last.render_context as Record<
            string,
            unknown
          >;
        if (last?.primera_fecha_emision)
          reconocimiento.primera_fecha_emision = new Date();
        return Promise.resolve({ affected: 1 });
      }),
    };
    const repository = {
      findOne: jest.fn(() => Promise.resolve({ ...reconocimiento })),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => query),
    };
    const service = new ReconocimientoService(
      repository as never,
      { render } as never,
      {} as never,
      { findActive, loadImage } as never,
    );
    return {
      service,
      reconocimiento,
      render,
      findActive,
      loadImage,
      set,
      repository,
    };
  }

  it('genera cada descarga sin almacenar los bytes PDF', async () => {
    const { service, render, set } = setup();
    await service.generatePdf('rec-1');
    await service.generatePdf('rec-1');
    expect(render).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: ReconocimientoEstado.EMITIDO,
        pdf_emitido: null,
      }),
    );
    expect(
      set.mock.calls
        .map(([value]) => value as { pdf_emitido?: unknown })
        .every((value) => !Buffer.isBuffer(value.pdf_emitido)),
    ).toBe(true);
  });

  it('usa la nueva versión activa al volver a descargar un reconocimiento emitido', async () => {
    const { service, render, findActive, loadImage, set } = setup();
    const original = {
      id: 'v2',
      imagen_path: 'congresos/1/general/v2.jpg',
      layout: { nameBox: {}, detailBoxes: [] },
    };
    const nueva = {
      id: 'v3',
      imagen_path: 'congresos/1/general/v3.jpg',
      layout: { nameBox: { x: 20 }, detailBoxes: [] },
    };
    findActive.mockResolvedValueOnce(original).mockResolvedValueOnce(nueva);
    await service.generatePdf('rec-1');
    await service.generatePdf('rec-1');
    expect(findActive).toHaveBeenCalledTimes(2);
    expect(findActive).toHaveBeenCalledWith(
      'congreso-1',
      ReconocimientoTipo.GENERAL,
    );
    expect(loadImage).toHaveBeenCalledTimes(2);
    expect(loadImage).toHaveBeenLastCalledWith(nueva);
    expect(render).toHaveBeenLastCalledWith(
      ReconocimientoTipo.GENERAL,
      'María Pérez',
      expect.any(Object),
      { image: Buffer.from('jpg'), layout: nueva.layout },
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ plantilla: nueva }),
    );
  });

  it('actualiza una emisión antigua que no tenía plantilla vinculada', async () => {
    const { service, render, findActive, set } = setup(
      ReconocimientoEstado.EMITIDO,
    );
    const nueva = {
      id: 'v1',
      layout: { nameBox: {}, detailBoxes: [] },
    };
    findActive.mockResolvedValue(nueva);
    await service.generatePdf('rec-1');
    expect(findActive).toHaveBeenCalledWith(
      'congreso-1',
      ReconocimientoTipo.GENERAL,
    );
    expect(render).toHaveBeenCalledWith(
      ReconocimientoTipo.GENERAL,
      'María Pérez',
      expect.any(Object),
      { image: Buffer.from('jpg'), layout: nueva.layout },
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ plantilla: nueva }),
    );
  });

  it('usa la plantilla vinculada si ya no hay ninguna activa', async () => {
    const { service, reconocimiento, render, findActive } = setup(
      ReconocimientoEstado.EMITIDO,
    );
    findActive.mockResolvedValue(null);
    const anterior = { id: 'v1', layout: { nameBox: {}, detailBoxes: [] } };
    reconocimiento.plantilla = anterior;
    await service.generatePdf('rec-1');
    expect(findActive).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(
      ReconocimientoTipo.GENERAL,
      'María Pérez',
      expect.any(Object),
      { image: Buffer.from('jpg'), layout: anterior.layout },
    );
  });

  it.each([ReconocimientoEstado.PENDIENTE, ReconocimientoEstado.EMITIDO])(
    'avisa cuando no existe plantilla activa ni vinculada (%s)',
    async (estado) => {
      const { service, render, findActive, set } = setup(estado);
      findActive.mockResolvedValue(null);
      await expect(service.generatePdf('rec-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(findActive).toHaveBeenCalledTimes(1);
      expect(render).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    },
  );

  it('registra un fallo y permite reintentar', async () => {
    const { service, render, set } = setup();
    render.mockRejectedValueOnce(new Error('fallo de render'));
    await expect(service.generatePdf('rec-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(service.generatePdf('rec-1')).resolves.toMatchObject({
      pdf: Buffer.from('%PDF-prueba'),
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        ultimo_error: expect.stringContaining('fallo de render'),
      }),
    );
  });

  it('libera PDFs heredados al iniciar y conserva el contexto', async () => {
    const { service, repository } = setup(ReconocimientoEstado.EMITIDO);
    repository.find.mockResolvedValueOnce([
      {
        id: 'rec-1',
        tipo: ReconocimientoTipo.GENERAL,
        hackaton_equipo: { nombre: 'Equipo Azul' },
        render_context: null,
      },
    ]);
    await service.onApplicationBootstrap();
    expect(repository.update).toHaveBeenCalledWith(
      'rec-1',
      expect.objectContaining({
        pdf_emitido: null,
        render_context: expect.objectContaining({ equipo: 'Equipo Azul' }),
      }),
    );
  });
});
