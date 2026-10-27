import { BadRequestException, ConflictException } from '@nestjs/common';
import { Hackaton } from '../entities/hackaton.entity';
import { HackatonEvaluador } from '../entities/hackaton-evaluador.entity';
import { HackatonEvaluadoresService } from './hackaton-evaluadores.service';

describe('HackatonEvaluadoresService', () => {
  function setup() {
    const hackaton = { id: 'hackaton', fecha_fin: '2020-01-01' };
    const issued = {
      id: 'asignado',
      reconocimiento_emitido_at: new Date(),
      ponente: { id: 'anterior', nombre: 'Ana' },
    };
    const assignments = [issued];
    const profiles = [{ id: 'nuevo', tipo: 'Evaluador' }];
    const assignedRepository = {
      find: jest.fn().mockResolvedValue(assignments),
      save: jest.fn().mockResolvedValue(undefined),
      softRemove: jest.fn(),
    };
    const hackatonBuilder = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(hackaton),
    };
    const profileBuilder = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(profiles),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === HackatonEvaluador) return assignedRepository;
        return {
          createQueryBuilder: () =>
            entity === Hackaton ? hackatonBuilder : profileBuilder,
        };
      }),
    };
    const service = new HackatonEvaluadoresService(
      {
        transaction: jest.fn(
          async (callback: (value: typeof manager) => Promise<void>) =>
            callback(manager),
        ),
      } as never,
      { findOne: jest.fn().mockResolvedValue(hackaton) } as never,
    );
    return { service, assignedRepository, profiles, issued, manager };
  }

  it('agrega evaluadores después del cierre conservando los reconocimientos emitidos', async () => {
    const { service, assignedRepository } = setup();

    await service.add('hackaton', { ponente_ids: ['nuevo'] });

    expect(assignedRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ ponente: { id: 'nuevo', tipo: 'Evaluador' } }),
    );
    expect(assignedRepository.softRemove).not.toHaveBeenCalled();
  });

  it('no duplica una asignación si se vuelve a agregar el mismo evaluador', async () => {
    const { service, assignedRepository, profiles } = setup();
    profiles[0].id = 'anterior';

    await service.add('hackaton', { ponente_ids: ['anterior'] });

    expect(assignedRepository.save).not.toHaveBeenCalled();
    expect(assignedRepository.softRemove).not.toHaveBeenCalled();
  });

  it('rechaza perfiles que no son evaluadores sin modificar las asignaciones', async () => {
    const { service, assignedRepository, profiles } = setup();
    profiles[0].tipo = 'Ponente';

    await expect(
      service.add('hackaton', { ponente_ids: ['nuevo'] }),
    ).rejects.toThrow(BadRequestException);

    expect(assignedRepository.save).not.toHaveBeenCalled();
    expect(assignedRepository.softRemove).not.toHaveBeenCalled();
  });

  it('conserva la protección contra quitar un reconocimiento ya emitido', async () => {
    const { service, assignedRepository } = setup();

    await expect(
      service.replace('hackaton', { ponente_ids: [] }),
    ).rejects.toThrow(ConflictException);

    expect(assignedRepository.softRemove).not.toHaveBeenCalled();
  });

  it('permite quitar una asignación que todavía no tiene reconocimiento', async () => {
    const { service, assignedRepository, issued } = setup();
    issued.reconocimiento_emitido_at = null as unknown as Date;

    await service.replace('hackaton', { ponente_ids: [] });

    expect(assignedRepository.softRemove).toHaveBeenCalledWith(issued);
  });
});
