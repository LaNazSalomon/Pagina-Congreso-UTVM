import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { RegistroNsuService } from './registro-nsu.service';
import type { ParticipanteNsu } from './entities/participante-nsu.entity';
import type { CreateRegistroNsuDto } from './dto/create-registro-nsu.dto';
import { RegistroNsu } from './entities/registro-nsu.entity';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('NSU: reintento de verificación sin duplicados', () => {
  const dto = {
    participantes: [{ correo: 'persona@example.com' }],
    comprobante: {},
  } as CreateRegistroNsuDto;
  function setup(participantes: Partial<ParticipanteNsu>[]) {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'prueba' });
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as never);
    const config: Record<string, string> = {
      MAIL_HOST: 'smtp.example.com',
      MAIL_USER: 'prueba@example.com',
      MAIL_PASS: 'prueba',
      MAIL_PORT: '587',
      MAIL_SECURE: 'false',
    };
    const transaction = jest.fn();
    const comprobantes = { create: jest.fn() };
    const service = new RegistroNsuService(
      {} as never,
      { find: jest.fn().mockResolvedValue(participantes) } as never,
      { get: jest.fn((key: string) => config[key]) } as never,
      {} as never,
      {} as never,
      { transaction } as never,
      comprobantes as never,
      {} as never,
    );
    return { service, transaction, comprobantes, sendMail, config };
  }
  const registro = {
    id: 'registro',
    total_participantes: 1,
    estado_pago: 'PENDIENTE',
  };
  const pendiente = {
    id: 'persona',
    correo: 'persona@example.com',
    correo_verificado: false,
    estado_pago: 'PENDIENTE',
    registro,
  } as Partial<ParticipanteNsu>;
  beforeEach(() =>
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
  );
  afterEach(() => jest.restoreAllMocks());

  it('conserva una alta nueva después del fallo de correo y recupera ese mismo grupo al reintentar', async () => {
    const persisted: ParticipanteNsu[] = [];
    const original = {
      id: 'registro',
      total_participantes: 1,
      estado_pago: 'PENDIENTE',
    };
    const registros = {
      create: jest.fn((data: unknown) => data),
      save: jest.fn().mockResolvedValue(original),
    };
    const participantes = {
      find: jest.fn(() => Promise.resolve([...persisted])),
      create: jest.fn((data: Partial<ParticipanteNsu>) => data),
      save: jest.fn((items: Partial<ParticipanteNsu>[]) => {
        persisted.push(
          ...items.map(
            (item) => ({ ...item, id: 'persona' }) as ParticipanteNsu,
          ),
        );
        return Promise.resolve(persisted);
      }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === RegistroNsu ? registros : participantes,
      ),
    };
    const transaction = jest.fn(
      (callback: (value: typeof manager) => Promise<void>) => callback(manager),
    );
    const comprobantes = {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'comprobante', path: 'nsu/prueba.pdf' }),
      removeObject: jest.fn(),
    };
    const config: Record<string, string> = {
      MAIL_HOST: 'smtp.example.com',
      MAIL_USER: 'cuenta@example.com',
      MAIL_PASS: 'prueba',
    };
    const sendMail = jest
      .fn()
      .mockRejectedValueOnce(new Error('SMTP no disponible'))
      .mockResolvedValue(undefined);
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as never);
    const service = new RegistroNsuService(
      registros as never,
      participantes as never,
      { get: (key: string) => config[key] } as never,
      {} as never,
      {} as never,
      { transaction } as never,
      comprobantes as never,
      {
        tarifa: jest.fn().mockResolvedValue(100),
        validarSeleccion: jest.fn().mockResolvedValue({
          congresoId: 'congreso',
          diaEventoIds: ['dia'],
          fechas: ['2026-10-18'],
        }),
      } as never,
    );
    const payload = {
      congresoId: 'congreso',
      comprobante: {} as never,
      participantes: [
        {
          nombreCompleto: 'Prueba',
          correo: 'persona@example.com',
          institucion: 'UTVM',
          carrera: 'TI',
          telefono: '5512345678',
          dias: '2026-10-18',
          diaEventoIds: ['dia'],
          montoNumero: 100,
        },
      ],
    };
    await expect(service.create(payload)).rejects.toMatchObject({
      status: 503,
    });
    await expect(service.create(payload)).resolves.toMatchObject({
      id: 'registro',
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(comprobantes.create).toHaveBeenCalledTimes(1);
    expect(comprobantes.removeObject).not.toHaveBeenCalled();
    expect(persisted).toHaveLength(1);
  });

  it('un fallo SMTP devuelve 503 y el reintento reenvía sin volver a guardar ni subir comprobantes', async () => {
    const { service, sendMail, transaction, comprobantes } = setup([pendiente]);
    sendMail.mockRejectedValueOnce(new Error('SMTP no disponible'));
    await expect(service.create(dto)).rejects.toMatchObject({ status: 503 });
    await expect(service.create(dto)).resolves.toMatchObject({
      id: 'registro',
    });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(transaction).not.toHaveBeenCalled();
    expect(comprobantes.create).not.toHaveBeenCalled();
    expect(nodemailer.createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });
  it('rechaza un grupo parcial para no mezclar registros', async () => {
    const { service, sendMail } = setup([
      {
        ...pendiente,
        registro: { ...registro, total_participantes: 2 } as never,
      },
    ]);
    await expect(service.create(dto)).rejects.toMatchObject({ status: 400 });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('no informa envío exitoso si falta la configuración', async () => {
    const { service, config, sendMail } = setup([pendiente]);
    delete config.MAIL_HOST;
    await expect(service.create(dto)).rejects.toMatchObject({ status: 503 });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('intenta todos los correos pendientes y respeta los ya verificados', async () => {
    const grupo = { ...registro, total_participantes: 3 };
    const { service, sendMail } = setup([
      { ...pendiente, registro: grupo as never },
      {
        ...pendiente,
        id: 'segunda',
        correo: 'segunda@example.com',
        registro: grupo as never,
      },
      {
        ...pendiente,
        id: 'tercera',
        correo: 'tercera@example.com',
        correo_verificado: true,
        registro: grupo as never,
      },
    ]);
    sendMail.mockRejectedValueOnce(new Error('Fallo transitorio'));
    await expect(
      service.create({
        ...dto,
        participantes: ['persona', 'segunda', 'tercera'].map((nombre) => ({
          correo: `${nombre}@example.com`,
        })) as never,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
