import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Congreso } from '../../congreso/entities/congreso.entity';
import { ReconocimientoPlantilla } from '../entities/reconocimiento-plantilla.entity';
import { Reconocimiento } from '../entities/reconocimiento.entity';
import { ReconocimientoTipo } from '../enums/reconocimiento-tipo.enum';
import { ReconocimientoPlantillasService } from './reconocimiento-plantillas.service';

describe('ReconocimientoPlantillasService', () => {
  const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-vista-previa'));
  const service = new ReconocimientoPlantillasService(
    {} as never,
    {} as never,
    { render } as never,
    {} as never,
  );
  const layout = {
    nameBox: { x: 110, yFromTop: 300, width: 548, height: 38, size: 24 },
    detailBoxes: [],
  };

  it('rechaza posiciones que salen de la página y detalles que no corresponden al tipo', () => {
    expect(() =>
      service.parseLayout(
        ReconocimientoTipo.GENERAL,
        JSON.stringify({
          ...layout,
          nameBox: { ...layout.nameBox, x: 750 },
        }),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      service.parseLayout(
        ReconocimientoTipo.HACKATON_EVALUADOR,
        JSON.stringify(layout),
      ),
    ).toThrow(BadRequestException);
  });

  it('previsualiza un JPG real usando las posiciones elegidas', async () => {
    const buffer = await readFile(
      join(__dirname, '__fixtures__', 'portrait.jpg'),
    );
    const file = {
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
    } as Express.Multer.File;
    const result = await service.preview(
      ReconocimientoTipo.GENERAL,
      JSON.stringify({
        nameBox: { x: 20, yFromTop: 300, width: 340, height: 38, size: 24 },
        detailBoxes: [],
      }),
      file,
    );
    expect(result.toString()).toBe('%PDF-vista-previa');
    expect(render).toHaveBeenCalledWith(
      ReconocimientoTipo.GENERAL,
      'María José Hernández Pérez',
      expect.any(Object),
      {
        image: buffer,
        layout: {
          nameBox: { x: 20, yFromTop: 300, width: 340, height: 38, size: 24 },
          detailBoxes: [],
          pageWidth: 384.125,
          pageHeight: 768.25,
        },
      },
    );
  });

  it('acepta una plantilla vertical y calcula la página sin estirarla', async () => {
    const buffer = await readFile(
      join(__dirname, '__fixtures__', 'portrait.jpg'),
    );
    const file = {
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
    } as Express.Multer.File;
    const portraitLayout = {
      nameBox: { x: 20, yFromTop: 300, width: 340, height: 38, size: 24 },
      detailBoxes: [],
    };
    await service.preview(
      ReconocimientoTipo.GENERAL,
      JSON.stringify(portraitLayout),
      file,
    );
    expect(render).toHaveBeenLastCalledWith(
      ReconocimientoTipo.GENERAL,
      'María José Hernández Pérez',
      expect.any(Object),
      {
        image: buffer,
        layout: { ...portraitLayout, pageWidth: 384.125, pageHeight: 768.25 },
      },
    );
  });

  it('rechaza archivos que no son JPG aunque tengan el nombre correcto', async () => {
    const file = {
      buffer: Buffer.from('PNG'),
      size: 3,
      mimetype: 'image/jpeg',
    } as Express.Multer.File;
    await expect(
      service.preview(ReconocimientoTipo.GENERAL, JSON.stringify(layout), file),
    ).rejects.toThrow(BadRequestException);
  });

  it('sube nuevas versiones sin guardar el JPG binario en la tabla', async () => {
    const buffer = await readFile(
      join(__dirname, '__fixtures__', 'portrait.jpg'),
    );
    const file = {
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
    } as Express.Multer.File;
    const congressQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'congreso-1' }),
    };
    const congressRepository = {
      createQueryBuilder: jest.fn(() => congressQuery),
    };
    const plantillaRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: unknown) => value),
    };
    const saved: Array<Record<string, unknown>> = [];
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Congreso ? congressRepository : plantillaRepository,
      ),
      save: jest.fn((value: Record<string, unknown>) => {
        saved.push(value);
        return Promise.resolve(value);
      }),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback(manager),
      ),
    };
    const storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const instance = new ReconocimientoPlantillasService(
      dataSource as never,
      {} as never,
      { render } as never,
      storage as never,
    );
    await instance.create(
      'congreso-1',
      ReconocimientoTipo.GENERAL,
      JSON.stringify({
        nameBox: { x: 20, yFromTop: 300, width: 340, height: 38, size: 24 },
        detailBoxes: [],
      }),
      file,
    );
    expect(manager.getRepository).toHaveBeenCalledWith(ReconocimientoPlantilla);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^congresos\/congreso-1\/GENERAL\/.*\.jpg$/),
      buffer,
    );
    expect(saved[0]?.imagen).toBeNull();
    expect(typeof saved[0]?.imagen_path).toBe('string');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('traslada plantillas anteriores y vacía su imagen binaria', async () => {
    const image = Buffer.from('jpg');
    const old = {
      id: 'plantilla-1',
      congreso: { id: 'congreso-1' },
      tipo: ReconocimientoTipo.GENERAL,
      imagen: image,
    };
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([old]),
    };
    const repository = {
      createQueryBuilder: jest.fn(() => query),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const instance = new ReconocimientoPlantillasService(
      {} as never,
      repository as never,
      { render } as never,
      storage as never,
    );
    await instance.onModuleInit();
    expect(storage.upload).toHaveBeenCalledWith(
      'congresos/congreso-1/GENERAL/plantilla-1.jpg',
      image,
    );
    expect(repository.update).toHaveBeenCalledWith('plantilla-1', {
      imagen_path: 'congresos/congreso-1/GENERAL/plantilla-1.jpg',
      imagen: null,
    });
  });

  it('genera un PDF de prueba desde la versión guardada sin emitir un reconocimiento', async () => {
    const image = Buffer.from('jpg de prueba');
    const plantilla = {
      id: 'plantilla-1',
      tipo: ReconocimientoTipo.GENERAL,
      imagen_path: 'congresos/1/GENERAL/plantilla-1.jpg',
      layout: { ...layout, pageWidth: 768.25, pageHeight: 598.125 },
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(plantilla),
      update: jest.fn(),
    };
    const storage = { download: jest.fn().mockResolvedValue(image) };
    const instance = new ReconocimientoPlantillasService(
      {} as never,
      repository as never,
      { render } as never,
      storage as never,
    );
    await expect(instance.previewSaved('plantilla-1')).resolves.toEqual(
      Buffer.from('%PDF-vista-previa'),
    );
    expect(storage.download).toHaveBeenCalledWith(plantilla.imagen_path);
    expect(render).toHaveBeenLastCalledWith(
      ReconocimientoTipo.GENERAL,
      'María José Hernández Pérez',
      expect.any(Object),
      { image, layout: plantilla.layout },
    );
    expect(repository.update).not.toHaveBeenCalled();
    repository.findOne.mockResolvedValueOnce(null);
    await expect(instance.previewSaved('sin-plantilla')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  function setupDelete(linked: number, replacement: object | null = null) {
    const plantilla = {
      id: 'plantilla-1',
      congreso: { id: 'congreso-1' },
      tipo: ReconocimientoTipo.GENERAL,
      imagen_path: 'congresos/congreso-1/GENERAL/plantilla-1.jpg',
    };
    const templates = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(plantilla)
        .mockResolvedValueOnce(replacement),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const recognitionQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: linked }),
    };
    const recognitions = {
      count: jest.fn().mockResolvedValue(linked),
      createQueryBuilder: jest.fn(() => recognitionQuery),
    };
    const congressQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(plantilla.congreso),
    };
    const congress = { createQueryBuilder: jest.fn(() => congressQuery) };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Congreso
          ? congress
          : entity === Reconocimiento
            ? recognitions
            : templates,
      ),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: unknown) => Promise<unknown>) =>
        callback(manager),
      ),
    };
    const storage = { remove: jest.fn().mockResolvedValue(undefined) };
    const instance = new ReconocimientoPlantillasService(
      dataSource as never,
      {} as never,
      { render } as never,
      storage as never,
    );
    return { instance, templates, recognitions, recognitionQuery, storage };
  }

  it('elimina una versión sin vínculos y su JPG de Storage', async () => {
    const { instance, templates, recognitionQuery, storage } = setupDelete(0);
    await instance.remove('plantilla-1');
    expect(templates.delete).toHaveBeenCalledWith('plantilla-1');
    expect(recognitionQuery.execute).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith(
      'congresos/congreso-1/GENERAL/plantilla-1.jpg',
    );
  });

  it('vincula los reconocimientos a la versión activa antes de borrar una anterior', async () => {
    const replacement = { id: 'plantilla-2' };
    const { instance, templates, recognitionQuery, storage } = setupDelete(
      2,
      replacement,
    );
    await instance.remove('plantilla-1');
    expect(recognitionQuery.set).toHaveBeenCalledWith({
      plantilla: replacement,
    });
    expect(recognitionQuery.execute).toHaveBeenCalled();
    expect(templates.delete).toHaveBeenCalledWith('plantilla-1');
    expect(storage.remove).toHaveBeenCalled();
  });

  it('impide eliminar la última plantilla usada por reconocimientos', async () => {
    const { instance, templates, storage } = setupDelete(1);
    await expect(instance.remove('plantilla-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(templates.delete).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
