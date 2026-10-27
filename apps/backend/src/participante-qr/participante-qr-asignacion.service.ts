import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Congreso } from '../congreso/entities/congreso.entity';
import { DiaEventoService } from '../dia-evento/dia-evento.service';
import { EnviarQrAccesoDto } from './dto/enviar-qr-acceso.dto';

export interface SeleccionRegistro {
  congresoId?: string | null;
  diaEventoIds?: string[] | null;
  creadoEn?: Date;
}

@Injectable()
export class ParticipanteQrAsignacionService {
  constructor(
    @InjectRepository(Congreso)
    private readonly congresos: Repository<Congreso>,
    private readonly diasEvento: DiaEventoService,
  ) {}

  async resolver(
    diasSeleccionados?: string[] | string,
    registro?: SeleccionRegistro,
  ): Promise<EnviarQrAccesoDto> {
    const query = this.congresos.createQueryBuilder('congreso');
    if (registro?.congresoId)
      query.where('congreso.id = :id', { id: registro.congresoId });
    else if (registro?.creadoEn)
      query.where('congreso.fecha_fin >= :creadoEn', {
        creadoEn: registro.creadoEn,
      });
    else query.where('congreso.fecha_fin::date >= CURRENT_DATE');
    const congreso = await query
      .orderBy('congreso.fecha_inicio', 'ASC')
      .getOne();
    if (!congreso) {
      throw new NotFoundException('No hay un congreso vigente o proximo');
    }

    const dias = await this.diasEvento.generar(congreso.id);
    const entries = registro?.diaEventoIds?.length
      ? registro.diaEventoIds
      : Array.isArray(diasSeleccionados)
        ? diasSeleccionados
        : (diasSeleccionados?.split(',') ?? []);
    const seleccion = [
      ...new Set(entries.map((item) => item.trim()).filter(Boolean)),
    ];
    const autorizados = seleccion.length
      ? seleccion.map((item) => {
          const ordinal = item.match(/^d[ií]a[\s_]*(\d+)$/i);
          const dia = ordinal
            ? dias[Number(ordinal[1]) - 1]
            : dias.find((dia) => dia.id === item || dia.fechaEvento === item);
          if (!dia)
            throw new BadRequestException(
              'Los días seleccionados no corresponden al congreso registrado.',
            );
          return dia;
        })
      : dias;
    if (!autorizados.length)
      throw new BadRequestException('El congreso no tiene días disponibles.');

    return {
      congresoId: congreso.id,
      diaEventoIds: autorizados.map((dia) => dia.id),
    };
  }
}
