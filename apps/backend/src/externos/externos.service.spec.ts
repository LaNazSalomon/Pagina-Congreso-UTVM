/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import type { Repository } from 'typeorm';

import { ExternosService } from './externos.service';
import type { Externo } from './entities/externo.entity';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import type { GeneradorCommon } from '../common/generador.common';
import type { ParticipanteQrEnvioService } from '../participante-qr/participante-qr-envio.service';
import type { ComprobanteService } from '../comprobante/comprobante.service';
import { ConflictException, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { CreateExternoDto } from './dto/create-externo.dto';
import type { DiaEventoService } from '../dia-evento/dia-evento.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('ExternosService.create', () => {
  const dto: CreateExternoDto = {
    congresoId: '00000000-0000-4000-8000-000000000001',
    diaEventoIds: ['00000000-0000-4000-8000-000000000002'],
    nombre: 'Ana',
    apellidoPaterno: 'López',
    correo: ' ANA@EXAMPLE.COM ',
    telefono: '5512345678',
    dias: ['2026-10-14'],
    total: 250,
  };
  const file = { originalname: 'pago.pdf' } as Express.Multer.File;

  function setup(externoInicial: Externo | null = null) {
    let externoPersistido = externoInicial;
    const repository = {
      findOne: jest.fn().mockImplementation(() => externoPersistido),
      create: jest.fn().mockImplementation((data: Partial<Externo>) => data),
      save: jest.fn().mockImplementation((data: Partial<Externo>) => {
        externoPersistido = { id: 'externo-id', ...data } as Externo;
        return externoPersistido;
      }),
    };
    const comprobantes = {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'comprobante-id', path: 'externos/pago.pdf' }),
      removeObject: jest.fn().mockResolvedValue(undefined),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(repository) };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          (callback: (value: typeof manager) => Promise<void>) =>
            callback(manager),
        ),
    };
    const settings: Record<string, string> = {
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_USER: 'test@example.com',
      MAIL_PASS: 'smtp-password',
      EMAIL_VERIFICATION_SECRET: 'test-secret',
    };
    const config = { get: jest.fn((key: string) => settings[key]) };
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'mail-id' });
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);

    const service = new ExternosService(
      repository as unknown as Repository<Externo>,
      config as unknown as ConfigService,
      {} as GeneradorCommon,
      {} as ParticipanteQrEnvioService,
      dataSource as unknown as DataSource,
      comprobantes as unknown as ComprobanteService,
      {
        validarSeleccion: jest.fn().mockResolvedValue({
          congresoId: dto.congresoId,
          diaEventoIds: dto.diaEventoIds,
          fechas: dto.dias,
        }),
      } as unknown as DiaEventoService,
    );
    return {
      service,
      repository,
      comprobantes,
      dataSource,
      settings,
      sendMail,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('guarda el registro y el comprobante, y envía el enlace al correo normalizado', async () => {
    const { service, repository, comprobantes, sendMail } = setup();

    await expect(service.create(dto, file)).resolves.toMatchObject({
      id: 'externo-id',
      status: 'pendiente_verificacion',
      correoVerificado: false,
    });

    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ correo: 'ana@example.com' }),
      }),
    );
    expect(comprobantes.create).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@example.com',
        html: expect.stringContaining('/api/externos/verificar-correo/'),
      }),
    );
  });

  it('devuelve 503 si SMTP falla y permite reintentar sin duplicar ni modificar el registro', async () => {
    const { service, repository, comprobantes, dataSource, sendMail } = setup();
    sendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    await expect(service.create(dto, file)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('Tu registro quedó guardado'),
    });

    await expect(
      service.create({ ...dto, nombre: 'Otro nombre', total: 750 }, file),
    ).resolves.toMatchObject({ id: 'externo-id', correoVerificado: false });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Ana',
        total: 250,
      }),
    );
    expect(comprobantes.create).toHaveBeenCalledTimes(1);
    expect(comprobantes.removeObject).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('reenvía la verificación de un registro pendiente creado anteriormente', async () => {
    const { service, dataSource, sendMail } = setup({
      id: 'registro-anterior',
      correo: 'ana@example.com',
      correoVerificado: false,
      status: 'pendiente_verificacion',
    } as Externo);

    await expect(service.create(dto, file)).resolves.toMatchObject({
      id: 'registro-anterior',
    });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
    const html = sendMail.mock.calls[0][0].html as string;
    const token = html.match(/verificar-correo\/([^"\s]+)/)![1];
    const payload = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
    );
    expect(payload).toMatchObject({
      externoId: 'registro-anterior',
      correo: 'ana@example.com',
    });
  });

  it.each([
    [true, 'pendiente'],
    [true, 'validado'],
    [false, 'rechazado'],
  ])(
    'mantiene el conflicto para correoVerificado=%s y status=%s',
    async (correoVerificado, status) => {
      const { service, dataSource, sendMail } = setup({
        correoVerificado,
        status,
      } as Externo);

      await expect(service.create(dto, file)).rejects.toThrow(
        ConflictException,
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    },
  );

  it('no informa que envió el correo cuando la configuración SMTP está incompleta', async () => {
    const { service, settings, sendMail } = setup();
    delete settings.MAIL_HOST;

    await expect(service.create(dto, file)).rejects.toMatchObject({
      status: 503,
    });

    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([
    ['587', 'true', true],
    ['465', 'false', false],
    ['465', undefined, true],
    ['587', undefined, false],
  ])(
    'respeta el puerto %s con MAIL_SECURE=%s',
    async (port, secure, expected) => {
      const { service, settings } = setup();
      settings.MAIL_PORT = port;
      if (secure !== undefined) settings.MAIL_SECURE = secure;

      await service.create(dto, file);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: Number(port),
          secure: expected,
        }),
      );
    },
  );

  it('elimina el archivo subido si falla el guardado y no intenta enviar correo', async () => {
    const { service, repository, comprobantes, sendMail } = setup();
    const error = new Error('Database unavailable');
    repository.save.mockRejectedValueOnce(error);

    await expect(service.create(dto, file)).rejects.toThrow(error);

    expect(comprobantes.removeObject).toHaveBeenCalledWith('externos/pago.pdf');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rechaza un importe que no corresponde a los días antes de subir el comprobante', async () => {
    const { service, comprobantes } = setup();
    await expect(
      service.create({ ...dto, total: 1 }, file),
    ).rejects.toMatchObject({ status: 400 });
    expect(comprobantes.create).not.toHaveBeenCalled();
  });
});

describe('ExternosService', () => {
  it('solo lista participantes externos con correo verificado', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Externo>;
    const service = new ExternosService(
      repository,
      {} as ConfigService,
      {} as GeneradorCommon,
      {} as ParticipanteQrEnvioService,
      {} as DataSource,
      {} as ComprobanteService,
      {} as DiaEventoService,
    );

    await service.findAll();

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          correoVerificado: true,
        }),
      }),
    );
  });
});
