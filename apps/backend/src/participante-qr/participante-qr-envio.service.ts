import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Congreso } from '../congreso/entities/congreso.entity';
import { CorreoService } from '../correo/correo.service';
import { ParticipanteTipo } from '../participante-acceso/participante-tipo.enum';
import { QrAccesoIssuanceService } from '../qr-acceso/services/qr-acceso-issuance.service';
import { EnviarQrAccesoDto } from './dto/enviar-qr-acceso.dto';
import { ParticipanteQrAsignacionService } from './participante-qr-asignacion.service';
import type { SeleccionRegistro } from './participante-qr-asignacion.service';

export interface EnviarQrAccesoResponse {
  mensaje: string;
  participante_id: string;
}

@Injectable()
export class ParticipanteQrEnvioService {
  validarSeleccionRegistrada(
    dto: EnviarQrAccesoDto,
    registro: SeleccionRegistro,
  ) {
    if (
      registro.congresoId &&
      (dto.congresoId !== registro.congresoId ||
        !dto.diaEventoIds.length ||
        dto.diaEventoIds.some((id) => !registro.diaEventoIds?.includes(id)))
    ) {
      throw new BadRequestException(
        'El QR solo puede autorizar las fechas del congreso seleccionadas en el registro.',
      );
    }
  }
  constructor(
    @InjectRepository(Congreso)
    private readonly congresos: Repository<Congreso>,
    private readonly issuance: QrAccesoIssuanceService,
    private readonly correo: CorreoService,
    private readonly asignacion: ParticipanteQrAsignacionService,
  ) {}

  async enviar(
    tipo: ParticipanteTipo,
    referenciaId: string,
    dto: EnviarQrAccesoDto,
  ): Promise<EnviarQrAccesoResponse> {
    const congreso = await this.congresos.findOneBy({ id: dto.congresoId });
    if (!congreso) {
      throw new NotFoundException('Congreso no encontrado');
    }

    const emitido = await this.issuance.issue({
      tipo,
      referenciaId,
      congresoId: dto.congresoId,
      diaEventoIds: dto.diaEventoIds,
    });
    await this.correo.enviarQrAcceso({
      destinatario: emitido.participante.correo,
      nombreParticipante: emitido.participante.nombreCompleto,
      nombreCongreso: congreso.nombre,
      accessUrl: emitido.accessUrl,
      qrPng: emitido.qrPng,
    });

    return {
      mensaje: 'QR de acceso enviado correctamente',
      participante_id: referenciaId,
    };
  }

  async enviarAutomatico(
    tipo: ParticipanteTipo,
    referenciaId: string,
    diasSeleccionados?: string[] | string,
    registro?: SeleccionRegistro,
  ): Promise<EnviarQrAccesoResponse> {
    const dto = await this.asignacion.resolver(diasSeleccionados, registro);
    return this.enviar(tipo, referenciaId, dto);
  }
}
