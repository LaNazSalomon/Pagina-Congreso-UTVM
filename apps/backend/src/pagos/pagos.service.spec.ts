import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { PagosService } from './pagos.service';
import { Congreso } from '../congreso/entities/congreso.entity';
import { ActualizarPagoDto } from './dto/actualizar-pago.dto';

describe('PagosService', () => {
  const congresoId = '00000000-0000-4000-8000-000000000001';
  function setup() {
    const configuraciones = { findOneBy: jest.fn().mockResolvedValue(null) };
    const documentos = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    const congresos = {
      findOneBy: jest.fn().mockResolvedValue({ id: congresoId }),
    };
    const storage = {
      upload: jest.fn(),
      download: jest.fn(),
      remove: jest.fn(),
    };
    const dataSource = { transaction: jest.fn() };
    const service = new PagosService(
      configuraciones as never,
      documentos as never,
      congresos as never,
      dataSource as never,
      storage as never,
    );
    return {
      service,
      configuraciones,
      documentos,
      congresos,
      storage,
      dataSource,
    };
  }

  it('mantiene las tarifas anteriores en congresos sin configuración y lee las nuevas por congreso', async () => {
    const { service, configuraciones } = setup();
    await expect(service.tarifas(congresoId)).resolves.toEqual({
      EXTERNO: 250,
      NSU: 100,
    });
    configuraciones.findOneBy.mockResolvedValue({
      tarifa_externo: '310.50',
      tarifa_nsu: '125.00',
    });
    await expect(service.tarifas(congresoId)).resolves.toEqual({
      EXTERNO: 310.5,
      NSU: 125,
    });
    expect(configuraciones.findOneBy).toHaveBeenCalledWith({
      congreso: { id: congresoId },
    });
  });

  it('acepta tarjeta de débito de 16 dígitos y conserva la CLABE de 18 dígitos como dato separado', async () => {
    const dto = Object.assign(new ActualizarPagoDto(), {
      tarifa_externo: 250,
      tarifa_nsu: 100,
      numero_tarjeta: '1234567890123456',
      clabe: '123456789012345678',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    dto.numero_tarjeta = '123456789012345678';
    expect((await validate(dto)).map((error) => error.property)).toContain(
      'numero_tarjeta',
    );
  });

  it('solo muestra el documento activo y no expone su ruta de almacenamiento', async () => {
    const { service, documentos } = setup();
    documentos.findOne.mockResolvedValue({
      id: 'documento',
      version: 2,
      activado_en: new Date(),
      path: 'privado.pdf',
    });
    const result = await service.publico(congresoId);
    expect(result.instrucciones).toMatchObject({ id: 'documento', version: 2 });
    expect(JSON.stringify(result)).not.toContain('privado.pdf');
    expect(documentos.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { congreso: { id: congresoId }, activo: true },
      }),
    );
  });

  it('rechaza un archivo disfrazado de PDF antes de subirlo', async () => {
    const { service, storage } = setup();
    await expect(
      service.subir(congresoId, {
        size: 20,
        mimetype: 'application/pdf',
        buffer: Buffer.from('esto no es un PDF'),
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('activa una versión solo después de confirmar que el PDF puede descargarse', async () => {
    const { service, storage, dataSource } = setup();
    const document = {
      id: 'documento',
      version: 2,
      congreso: { id: congresoId },
      path: 'v2.pdf',
      activo: false,
      activado_en: null,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(document),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockResolvedValue(document),
    };
    const builder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue({ id: congresoId }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Congreso
          ? { createQueryBuilder: () => builder }
          : repository,
      ),
    };
    dataSource.transaction.mockImplementation(
      (callback: (tx: typeof manager) => Promise<unknown>) => callback(manager),
    );
    storage.download.mockResolvedValue(Buffer.from('%PDF-prueba'));
    await expect(service.activar(document.id)).resolves.toMatchObject({
      activo: true,
      version: 2,
    });
    expect(storage.download).toHaveBeenCalledWith('v2.pdf');
    expect(repository.update).toHaveBeenCalledWith(
      { congreso: { id: congresoId }, activo: true },
      { activo: false },
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: document.id, activo: true }),
    );
    expect(storage.download.mock.invocationCallOrder[0]).toBeLessThan(
      repository.update.mock.invocationCallOrder[0],
    );
  });
});
