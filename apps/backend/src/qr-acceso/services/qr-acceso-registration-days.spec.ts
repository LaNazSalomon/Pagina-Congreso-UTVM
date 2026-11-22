import { UnprocessableEntityException } from '@nestjs/common';
import {
  RolPersonal,
  UsuarioPersonal,
} from '../../personal/entities/personal.entity';
import { CodigoQr } from '../../codigo-qr/entities/codigo-qr.entity';
import { DiaEvento } from '../../dia-evento/entities/dia-evento.entity';
import { DiaParticipante } from '../entities/dia-participante.entity';
import { QrAcceso } from '../entities/qr-acceso.entity';
import { QrAccesoValidationService } from './qr-acceso-validation.service';
import { QrAccessErrorService } from './qr-access-error.service';
import { QrAccesoIssuanceService } from './qr-acceso-issuance.service';
import { ParticipanteTipo } from '../../participante-acceso/participante-tipo.enum';

describe('QR: fechas seleccionadas en el registro', () => {
  function setup() {
    const person = {
      tipo: ParticipanteTipo.EXTERNO,
      referenciaId: 'persona',
      nombreCompleto: 'Prueba',
      correo: 'prueba@example.com',
      congresoId: 'congreso',
      diaEventoIds: ['hoy'],
    };
    const manager = {
      query: jest.fn().mockResolvedValue([{ fecha: '2026-10-18' }]),
      findOne: jest.fn((entity: unknown) => {
        if (entity === UsuarioPersonal)
          return Promise.resolve({
            id: 'validador',
            activo: true,
            correoVerificado: true,
            rol: RolPersonal.VALIDADOR,
          });
        if (entity === CodigoQr)
          return Promise.resolve({
            id: 'codigo',
            tipo: 'acceso',
            activo: true,
          });
        if (entity === QrAcceso)
          return Promise.resolve({
            participante: {
              id: 'acceso',
              tipo: person.tipo,
              referencia_id: person.referenciaId,
              congreso: {
                id: 'congreso',
                fecha_inicio: new Date('2026-10-14T00:00:00.000Z'),
                fecha_fin: new Date('2026-10-31T23:59:59.999Z'),
              },
            },
          });
        if (entity === DiaEvento)
          return Promise.resolve({
            id: 'hoy',
            fecha_evento: '2026-10-18',
            congreso: { id: 'congreso', nombre: 'Congreso' },
          });
        if (entity === DiaParticipante)
          return Promise.resolve({
            participante_id: 'acceso',
            dia_evento_id: 'hoy',
            acceso_utilizado: false,
          });
        throw new Error('Entidad inesperada');
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const resolver = { resolve: jest.fn().mockResolvedValue(person) };
    const dataSource = {
      manager,
      transaction: jest.fn(
        (callback: (value: typeof manager) => Promise<unknown>) =>
          callback(manager),
      ),
    };
    const validation = new QrAccesoValidationService(
      dataSource as never,
      { hashToken: jest.fn().mockReturnValue('hash') } as never,
      resolver as never,
      new QrAccessErrorService(),
      { get: jest.fn().mockReturnValue('America/Mexico_City') } as never,
    );
    const issuance = new QrAccesoIssuanceService(
      dataSource as never,
      {} as never,
      resolver as never,
      {} as never,
      {} as never,
      {
        withLock: jest.fn((_key: string, callback: () => Promise<unknown>) =>
          callback(),
        ),
      } as never,
    );
    return { person, validation, issuance, manager };
  }

  it('permite consultar y confirmar un día seleccionado', async () => {
    const { validation, manager } = setup();
    await expect(validation.inspect('token')).resolves.toMatchObject({
      valido: true,
    });
    await expect(
      validation.confirm('token', 'validador'),
    ).resolves.toMatchObject({
      dia: { accesoUtilizado: true },
    });
    expect(manager.update).toHaveBeenCalledTimes(1);
  });

  it('impide usar un permiso antiguo si el día ya no está en el registro', async () => {
    const { person, validation, manager } = setup();
    person.diaEventoIds = ['otro-dia'];
    await expect(validation.confirm('token', 'validador')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('impide confirmar un QR asociado a otro congreso', async () => {
    const { person, validation, manager } = setup();
    person.congresoId = 'otro-congreso';
    await expect(validation.confirm('token', 'validador')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('impide emitir un QR con fechas que no fueron registradas', async () => {
    const { issuance } = setup();
    await expect(
      issuance.issue({
        tipo: ParticipanteTipo.EXTERNO,
        referenciaId: 'persona',
        congresoId: 'congreso',
        diaEventoIds: ['no-pagado'],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rechaza la entrada el día anterior al inicio aunque haya un permiso antiguo', async () => {
    const { validation, manager } = setup();
    manager.query.mockResolvedValue([{ fecha: '2026-10-13' }]);
    await expect(
      validation.confirm('token', 'validador'),
    ).rejects.toMatchObject({
      status: 422,
    });
    expect(manager.update).not.toHaveBeenCalled();
  });
});
