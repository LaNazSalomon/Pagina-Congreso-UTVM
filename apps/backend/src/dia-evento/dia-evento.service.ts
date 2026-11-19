import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DatabaseErrorHandlerService } from '../common/database/handle-database-error';
import { ResourceLockService } from '../common/resource-lock.service';
import { Congreso } from '../congreso/entities/congreso.entity';
import { DiaEvento } from './entities/dia-evento.entity';
import { REGISTRO_TARIFAS } from './registro-tarifas.constant';
import { PagosService } from '../pagos/pagos.service';

export interface DiaEventoResponse {
  id: string;
  fechaEvento: string;
  etiqueta: string;
}

const MAX_DIAS_CONGRESO = 366;

@Injectable()
export class DiaEventoService {
  private readonly timeZone: string;

  constructor(
    @InjectRepository(DiaEvento)
    private readonly dias: Repository<DiaEvento>,
    @InjectRepository(Congreso)
    private readonly congresos: Repository<Congreso>,
    private readonly config: ConfigService,
    private readonly locks: ResourceLockService,
    private readonly dbErrors: DatabaseErrorHandlerService,
    private readonly pagos: PagosService,
  ) {
    this.timeZone = this.config.get<string>(
      'CONGRESS_TIMEZONE',
      'America/Mexico_City',
    );
  }

  generar(congresoId: string): Promise<DiaEventoResponse[]> {
    return this.locks.withLock(`dias-congreso:${congresoId}`, () =>
      this.generarLocked(congresoId),
    );
  }

  async opcionesRegistro() {
    const congresos = await this.congresos
      .createQueryBuilder('congreso')
      .where(
        'congreso.fecha_fin >= (CURRENT_TIMESTAMP AT TIME ZONE :timezone)',
        { timezone: this.timeZone },
      )
      .orderBy('congreso.fecha_inicio', 'ASC')
      .getMany();
    const opciones = [] as Array<{
      id: string;
      nombre: string;
      fechaInicio: string;
      fechaFin: string;
      dias: DiaEventoResponse[];
      tarifas: { EXTERNO: number; NSU: number };
    }>;
    for (const congreso of congresos) {
      opciones.push({
        id: congreso.id,
        nombre: congreso.nombre,
        fechaInicio: this.toDateOnly(congreso.fecha_inicio),
        fechaFin: this.toDateOnly(congreso.fecha_fin),
        dias: await this.generar(congreso.id),
        tarifas: await this.pagos.tarifas(congreso.id),
      });
    }
    return { congresos: opciones, tarifas: REGISTRO_TARIFAS };
  }

  async tarifa(congresoId: string, tipo: 'EXTERNO' | 'NSU'): Promise<number> {
    return (await this.pagos.tarifas(congresoId))[tipo];
  }

  async validarSeleccion(congresoId: string, ids: string[]) {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      typeof congresoId !== 'string' ||
      !uuid.test(congresoId) ||
      !Array.isArray(ids) ||
      !ids.length ||
      ids.some((id) => typeof id !== 'string' || !uuid.test(id))
    ) {
      throw new BadRequestException(
        'Selecciona un congreso y al menos una fecha válida.',
      );
    }
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('No se permiten días duplicados.');
    const disponibles = await this.generar(congresoId);
    const seleccionados = disponibles.filter((dia) => ids.includes(dia.id));
    if (seleccionados.length !== ids.length)
      throw new BadRequestException(
        'Las fechas seleccionadas no pertenecen al periodo del congreso.',
      );
    return {
      congresoId,
      diaEventoIds: seleccionados.map((dia) => dia.id),
      fechas: seleccionados.map((dia) => dia.fechaEvento),
    };
  }

  async findByCongreso(congresoId: string): Promise<DiaEventoResponse[]> {
    const congreso = await this.ensureCongreso(congresoId);
    const dias = await this.dias.find({
      where: { congreso: { id: congresoId } },
      order: { fecha_evento: 'ASC' },
    });
    return dias
      .filter(
        (dia) =>
          dia.fecha_evento >= this.toDateOnly(congreso.fecha_inicio) &&
          dia.fecha_evento <= this.toDateOnly(congreso.fecha_fin),
      )
      .map((dia) =>
        this.toResponse(dia, this.toDateOnly(congreso.fecha_inicio)),
      );
  }

  async findAuthorized(
    congresoId: string,
    diaIds: string[],
  ): Promise<DiaEvento[]> {
    const dias = await this.dias
      .createQueryBuilder('dia')
      .innerJoinAndSelect('dia.congreso', 'congreso')
      .where('congreso.id = :congresoId', { congresoId })
      .andWhere('dia.id IN (:...diaIds)', { diaIds })
      .getMany();

    if (
      dias.length !== new Set(diaIds).size ||
      dias.some(
        (dia) =>
          dia.fecha_evento < this.toDateOnly(dia.congreso.fecha_inicio) ||
          dia.fecha_evento > this.toDateOnly(dia.congreso.fecha_fin),
      )
    ) {
      throw new BadRequestException(
        'Uno o mas dias no pertenecen al congreso indicado',
      );
    }
    return dias;
  }

  private async generarLocked(
    congresoId: string,
  ): Promise<DiaEventoResponse[]> {
    const congreso = await this.ensureCongreso(congresoId);
    const inicio = this.toDateOnly(congreso.fecha_inicio);
    const fin = this.toDateOnly(congreso.fecha_fin);
    const fechas = this.expandRange(inicio, fin);

    const existentes = await this.dias.find({
      where: { congreso: { id: congresoId } },
    });
    const fechasExistentes = new Set(existentes.map((dia) => dia.fecha_evento));
    const nuevos = fechas
      .filter((fecha) => !fechasExistentes.has(fecha))
      .map((fecha) =>
        this.dias.create({
          congreso,
          fecha_evento: fecha,
          etiqueta: `Dia ${fechas.indexOf(fecha) + 1}`,
        }),
      );

    const corregidos = existentes.filter((dia) => {
      const index = fechas.indexOf(dia.fecha_evento);
      if (index < 0 || dia.etiqueta === `Dia ${index + 1}`) return false;
      dia.etiqueta = `Dia ${index + 1}`;
      return true;
    });

    if (nuevos.length + corregidos.length > 0) {
      try {
        await this.dias.save([...nuevos, ...corregidos]);
      } catch (error) {
        this.dbErrors.handle(error);
      }
    }

    return this.findByCongreso(congresoId);
  }

  private async ensureCongreso(id: string): Promise<Congreso> {
    const congreso = await this.congresos.findOneBy({ id });
    if (!congreso) {
      throw new NotFoundException('Congreso no encontrado');
    }
    return congreso;
  }

  private expandRange(inicio: string, fin: string): string[] {
    const current = new Date(`${inicio}T00:00:00.000Z`);
    const last = new Date(`${fin}T00:00:00.000Z`);
    const fechas: string[] = [];

    while (current <= last) {
      if (fechas.length >= MAX_DIAS_CONGRESO) {
        throw new BadRequestException(
          'El rango del congreso es demasiado largo',
        );
      }
      fechas.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    if (fechas.length === 0) {
      throw new BadRequestException(
        'El rango de fechas del congreso es invalido',
      );
    }
    return fechas;
  }

  private toDateOnly(value: Date): string {
    // El administrador guarda el día del calendario a medianoche UTC.
    // Convertirlo a la zona local desplazaría el inicio al día anterior.
    return value.toISOString().slice(0, 10);
  }

  private toResponse(dia: DiaEvento, inicio: string): DiaEventoResponse {
    const ordinal =
      (Date.parse(dia.fecha_evento) - Date.parse(inicio)) / 86400000 + 1;
    return {
      id: dia.id,
      fechaEvento: dia.fecha_evento,
      etiqueta: `Dia ${ordinal}`,
    };
  }
}
