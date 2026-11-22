import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull, Not } from 'typeorm';
import * as nodemailer from 'nodemailer';

import { createHmac, timingSafeEqual } from 'crypto';

import { Externo } from './entities/externo.entity';
import { CreateExternoDto } from './dto/create-externo.dto';
import { UpdateExternoDto } from './dto/update-externo.dto';
import { GeneradorCommon } from '../common/generador.common';
import { EnviarQrAccesoDto } from '../participante-qr/dto/enviar-qr-acceso.dto';
import { ParticipanteQrEnvioService } from '../participante-qr/participante-qr-envio.service';
import { ParticipanteTipo } from '../participante-acceso/participante-tipo.enum';
import { ComprobanteService } from '../comprobante/comprobante.service';
import type { ArchivoComprobante } from '../comprobante/entities/archivo-comprobante.entity';
import { DiaEventoService } from '../dia-evento/dia-evento.service';
import { calcularTotalRegistro } from '../dia-evento/registro-tarifas.constant';

@Injectable()
export class ExternosService {
  private readonly logger = new Logger(ExternosService.name);

  constructor(
    @InjectRepository(Externo)
    private readonly externoRepository: Repository<Externo>,

    private readonly configService: ConfigService,
    private readonly generador: GeneradorCommon,
    private readonly qrEnvio: ParticipanteQrEnvioService,
    private readonly dataSource: DataSource,
    private readonly comprobantes: ComprobanteService,
    private readonly diasEvento: DiaEventoService,
  ) {}

  async create(
    createExternoDto: CreateExternoDto,
    comprobante: Express.Multer.File,
  ) {
    const correoNormalizado = createExternoDto.correo.trim().toLowerCase();

    const correoExistente = await this.externoRepository.findOne({
      where: {
        correo: correoNormalizado,
        deleted_at: IsNull(),
      },
    });

    if (correoExistente) {
      if (
        !correoExistente.correoVerificado &&
        correoExistente.status === 'pendiente_verificacion'
      ) {
        return this.enviarVerificacionRegistro(correoExistente);
      }

      throw new ConflictException(
        'Este correo ya fue registrado anteriormente. Revisa tu correo electrónico o usa uno diferente.',
      );
    }

    const seleccion = await this.diasEvento.validarSeleccion(
      createExternoDto.congresoId,
      createExternoDto.diaEventoIds,
    );
    const totalEsperado = calcularTotalRegistro(
      seleccion.diaEventoIds.length,
      await this.diasEvento.tarifa(seleccion.congresoId, 'EXTERNO'),
    );
    if (Number(createExternoDto.total) !== totalEsperado)
      throw new BadRequestException(
        'El precio cambió o el total no coincide con los días seleccionados. Revisa el nuevo importe antes de registrarte.',
      );
    let archivoGuardado: ArchivoComprobante | undefined;
    let externoGuardado!: Externo;

    try {
      await this.dataSource.transaction(async (manager) => {
        archivoGuardado = await this.comprobantes.create(
          comprobante,
          'externos',
          manager,
        );
        const externoRepository = manager.getRepository(Externo);
        externoGuardado = await externoRepository.save(
          externoRepository.create({
            ...createExternoDto,
            congresoId: seleccion.congresoId,
            diaEventoIds: seleccion.diaEventoIds,
            dias: seleccion.fechas,
            total: totalEsperado,
            correo: correoNormalizado,
            institucion: createExternoDto.institucion || null,
            apellidoMaterno: createExternoDto.apellidoMaterno || null,
            comprobante: archivoGuardado,
            correoVerificado: false,
            status: 'pendiente_verificacion',
          }),
        );
      });
    } catch (error) {
      if (archivoGuardado?.path) {
        await this.comprobantes.removeObject(archivoGuardado.path);
      }
      throw error;
    }

    return this.enviarVerificacionRegistro(externoGuardado);
  }

  private async enviarVerificacionRegistro(externo: Externo) {
    try {
      const verificationToken = this.crearTokenVerificacion(
        externo.id,
        externo.correo,
      );

      await this.enviarCorreoVerificacion(externo.correo, verificationToken);
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el correo de verificación de externos',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Tu registro quedó guardado, pero no pudimos enviar el correo de verificación. Intenta registrar de nuevo con el mismo correo para reenviar el enlace sin duplicar tu registro.',
      );
    }

    return {
      mensaje:
        'Registro recibido. Revisa tu correo electrónico para verificarlo y finalizar el proceso.',
      id: externo.id,
      status: externo.status,
      correoVerificado: externo.correoVerificado,
    };
  }

  async verificarCorreo(token: string) {
    const payload = this.validarTokenVerificacion(token);

    const externo = await this.externoRepository.findOne({
      where: {
        id: payload.externoId,
        correo: payload.correo,
      },
    });

    if (!externo) {
      throw new BadRequestException(
        'No se encontró el registro asociado al enlace de verificación.',
      );
    }

    if (externo.correoVerificado) {
      return {
        mensaje: 'El correo ya se encontraba verificado.',
      };
    }

    externo.correoVerificado = true;
    externo.status = 'pendiente';

    await this.externoRepository.save(externo);

    return {
      mensaje: 'Correo verificado correctamente. Registro finalizado.',
    };
  }

  async findAll() {
    return await this.externoRepository.find({
      where: {
        correoVerificado: true,
        deleted_at: IsNull(),
      },
      relations: {
        comprobante: true,
        congreso: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string) {
    const externo = await this.externoRepository.findOne({
      where: { id, deleted_at: IsNull() },
      relations: {
        comprobante: true,
        congreso: true,
      },
    });

    if (!externo) {
      throw new NotFoundException('Externo no encontrado');
    }

    return externo;
  }

  async update(id: string, updateExternoDto: UpdateExternoDto) {
    const externo = await this.findOne(id);

    if (
      updateExternoDto.dias !== undefined ||
      updateExternoDto.diaEventoIds !== undefined ||
      updateExternoDto.congresoId !== undefined
    ) {
      const seleccion = await this.diasEvento.validarSeleccion(
        updateExternoDto.congresoId ?? externo.congresoId!,
        updateExternoDto.diaEventoIds ?? externo.diaEventoIds!,
      );
      const cambioDias =
        externo.congresoId !== seleccion.congresoId ||
        externo.diaEventoIds?.length !== seleccion.diaEventoIds.length ||
        seleccion.diaEventoIds.some(
          (id) => !externo.diaEventoIds?.includes(id),
        );
      updateExternoDto = {
        ...updateExternoDto,
        congresoId: seleccion.congresoId,
        diaEventoIds: seleccion.diaEventoIds,
        dias: seleccion.fechas,
        total: cambioDias
          ? calcularTotalRegistro(
              seleccion.diaEventoIds.length,
              externo.congresoId === seleccion.congresoId &&
                externo.diaEventoIds?.length
                ? Number(externo.total) / externo.diaEventoIds.length
                : await this.diasEvento.tarifa(seleccion.congresoId, 'EXTERNO'),
            )
          : externo.total,
      };
    }

    if (updateExternoDto.status === 'validado' && !externo.correoVerificado) {
      throw new BadRequestException(
        'No se puede validar un registro con correo pendiente de verificacion',
      );
    }

    Object.assign(externo, updateExternoDto);

    return await this.externoRepository.save(externo);
  }

  async remove(id: string) {
    const externo = await this.findOne(id);

    externo.correoOriginal = externo.correoOriginal ?? externo.correo;
    externo.correo = this.generador.CorreoEliminado();

    await this.externoRepository.save(externo);
    await this.externoRepository.softDelete(id);

    return externo;
  }

  async restore(id: string) {
    const externo = await this.externoRepository.findOne({
      where: { id },
      relations: { comprobante: true },
      withDeleted: true,
    });

    if (!externo) {
      throw new NotFoundException('Externo no encontrado');
    }

    const correoRestaurado = externo.correoOriginal ?? externo.correo;
    const correoEnUso = await this.externoRepository.findOne({
      where: {
        id: Not(id),
        correo: correoRestaurado,
        deleted_at: IsNull(),
      },
    });

    if (correoEnUso) {
      throw new ConflictException(
        `No se puede restaurar el externo porque el correo ${correoRestaurado} ya está en uso.`,
      );
    }

    await this.externoRepository.restore(id);

    externo.correo = correoRestaurado;
    externo.correoOriginal = null;
    externo.deleted_at = undefined;

    return this.externoRepository.save(externo);
  }

  async enviarQrAcceso(id: string, dto: EnviarQrAccesoDto) {
    const participante = await this.findOne(id);
    this.qrEnvio.validarSeleccionRegistrada(dto, participante);
    return this.qrEnvio.enviar(ParticipanteTipo.EXTERNO, id, dto);
  }

  async enviarQrAccesoAutomatico(id: string) {
    const participante = await this.findOne(id);
    return this.qrEnvio.enviarAutomatico(
      ParticipanteTipo.EXTERNO,
      id,
      participante.dias,
      { ...participante, creadoEn: participante.createdAt },
    );
  }

  private crearTokenVerificacion(externoId: string, correo: string) {
    const secret =
      this.configService.get<string>('EMAIL_VERIFICATION_SECRET') ||
      'clave_temporal_desarrollo';

    const payload = {
      externoId,
      correo,
      expiraEn: Date.now() + 1000 * 60 * 60 * 24,
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );

    const firma = createHmac('sha256', secret)
      .update(payloadBase64)
      .digest('base64url');

    return `${payloadBase64}.${firma}`;
  }

  private validarTokenVerificacion(token: string): {
    externoId: string;
    correo: string;
    expiraEn: number;
  } {
    if (!token) {
      throw new BadRequestException('El enlace de verificación no es válido.');
    }

    const secret =
      this.configService.get<string>('EMAIL_VERIFICATION_SECRET') ||
      'clave_temporal_desarrollo';

    const partes = token.split('.');

    if (partes.length !== 2) {
      throw new BadRequestException('Enlace de verificación inválido.');
    }

    const payloadBase64 = partes[0];
    const firmaRecibida = partes[1];

    const firmaEsperada = createHmac('sha256', secret)
      .update(payloadBase64)
      .digest('base64url');

    const firmaRecibidaBuffer = Buffer.from(firmaRecibida);
    const firmaEsperadaBuffer = Buffer.from(firmaEsperada);

    if (
      firmaRecibidaBuffer.length !== firmaEsperadaBuffer.length ||
      !timingSafeEqual(firmaRecibidaBuffer, firmaEsperadaBuffer)
    ) {
      throw new BadRequestException('Enlace de verificación inválido.');
    }

    const payload = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf8'),
    ) as {
      externoId: string;
      correo: string;
      expiraEn: number;
    };

    if (payload.expiraEn < Date.now()) {
      throw new BadRequestException('El enlace de verificación expiró.');
    }

    return payload;
  }

  private async enviarCorreoVerificacion(
    correo: string,
    verificationToken: string,
  ) {
    const mailHost = this.configService.get<string>('MAIL_HOST');

    const mailPort = Number(this.configService.get<string>('MAIL_PORT') || 465);

    const mailUser = this.configService.get<string>('MAIL_USER');
    const mailPass = this.configService.get<string>('MAIL_PASS');

    const mailFrom = this.configService.get<string>('MAIL_FROM') || mailUser;

    const backendUrl =
      this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000';

    const enlace = `${backendUrl}/api/externos/verificar-correo/${encodeURIComponent(verificationToken)}`;

    if (!mailHost || !mailUser || !mailPass) {
      throw new Error('Configuración SMTP incompleta.');
    }

    const mailSecure = this.configService.get<string>('MAIL_SECURE');
    const transporter = nodemailer.createTransport({
      host: mailHost,
      port: mailPort,
      secure: mailSecure ? mailSecure === 'true' : mailPort === 465,
      auth: {
        user: mailUser,
        pass: mailPass,
      },
    });

    await transporter.sendMail({
      from: mailFrom,
      to: correo,
      subject: 'Confirma tu registro al Congreso UTVM',
      html: `
        <div style="font-family: Arial, sans-serif; color: #1d2b28;">
          <h2>Verificación de correo</h2>

          <p>
            Recibimos tu solicitud de registro para el Congreso UTVM.
          </p>

          <p>
            Para finalizar tu registro, confirma tu correo electrónico dando clic en el siguiente botón:
          </p>

          <p>
            <a
              href="${enlace}"
              style="
                display: inline-block;
                padding: 12px 18px;
                background: #00e0a4;
                color: #031f1d;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
              "
            >
              Confirmar registro
            </a>
          </p>

          <p>
            Este enlace estará disponible durante 24 horas.
          </p>

          <p>
            Si no solicitaste este registro, puedes ignorar este correo.
          </p>
        </div>
      `,
    });
  }
}
