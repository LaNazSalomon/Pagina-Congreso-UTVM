import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { IsNull, Not, Repository } from 'typeorm';

import { FindReconocimientoDto } from './dto/find-reconocimiento.dto';
import { Reconocimiento } from './entities/reconocimiento.entity';
import { ReconocimientoEstado } from './enums/reconocimiento-estado.enum';
import { ReconocimientoTipo } from './enums/reconocimiento-tipo.enum';
import { ReconocimientoRendererService } from './services/reconocimiento-renderer.service';
import { ReconocimientoEmisionService } from './services/reconocimiento-emision.service';
import { ReconocimientoPlantillasService } from './services/reconocimiento-plantillas.service';
import type { ReconocimientoRenderContext } from './services/reconocimiento-renderer.service';
import { HACKATON_RESULTADO_LABEL } from '../hackaton/enums/hackaton-resultado.enum';

@Injectable()
export class ReconocimientoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReconocimientoService.name);
  private readonly relations = {
    congreso: true,
    taller: true,
    conferencia: true,
    hackaton: true,
    hackaton_equipo: true,
    participante: true,
    ponente: true,
    plantilla: true,
  } as const;

  constructor(
    @InjectRepository(Reconocimiento)
    private readonly repository: Repository<Reconocimiento>,
    private readonly renderer: ReconocimientoRendererService,
    private readonly emision: ReconocimientoEmisionService,
    private readonly plantillas: ReconocimientoPlantillasService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Los PDF antiguos solo se eliminan después de conservar los datos necesarios
    // para volver a renderizarlos con su plantilla vinculada.
    const legacy = await this.repository.find({
      where: { pdf_emitido: Not(IsNull()) },
      relations: this.relations,
    });
    for (const reconocimiento of legacy) {
      try {
        if (reconocimiento.plantilla) {
          await this.plantillas.loadImage(reconocimiento.plantilla);
        }
        await this.repository.update(reconocimiento.id, {
          render_context:
            reconocimiento.render_context ?? this.renderContext(reconocimiento),
          pdf_emitido: null,
        });
      } catch (error) {
        this.logger.error(
          `No se pudo liberar el PDF ${reconocimiento.id}: ${String(error)}`,
        );
      }
    }
  }

  private renderContext(
    reconocimiento: Reconocimiento,
  ): ReconocimientoRenderContext {
    return {
      equipo: reconocimiento.hackaton_equipo?.nombre,
      resultado: reconocimiento.hackaton_equipo?.resultado
        ? HACKATON_RESULTADO_LABEL[reconocimiento.hackaton_equipo.resultado]
        : undefined,
      participacion:
        reconocimiento.tipo === ReconocimientoTipo.HACKATON_EVALUADOR
          ? `Participación como evaluador de ${reconocimiento.hackaton?.nombre ?? 'Hackatón'}`
          : undefined,
    };
  }

  prepareForTaller(tallerId: string): Promise<void> {
    return this.emision.prepareTallerista(tallerId);
  }

  prepareForConferencia(conferenciaId: string): Promise<void> {
    return this.emision.prepareConferencista(conferenciaId);
  }

  async findAll(query: FindReconocimientoDto) {
    const builder = this.repository
      .createQueryBuilder('reconocimiento')
      .leftJoinAndSelect('reconocimiento.congreso', 'congreso')
      .leftJoinAndSelect('reconocimiento.taller', 'taller')
      .leftJoinAndSelect('reconocimiento.conferencia', 'conferencia')
      .leftJoinAndSelect('reconocimiento.hackaton', 'hackaton')
      .leftJoinAndSelect('reconocimiento.hackaton_equipo', 'hackaton_equipo')
      .leftJoinAndSelect('reconocimiento.participante', 'participante')
      .leftJoinAndSelect('reconocimiento.ponente', 'ponente')
      .leftJoinAndSelect('reconocimiento.plantilla', 'plantilla')
      .orderBy('reconocimiento.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.congresoId) builder.andWhere('congreso.id = :congresoId', query);
    if (query.tallerId) builder.andWhere('taller.id = :tallerId', query);
    if (query.conferenciaId)
      builder.andWhere('conferencia.id = :conferenciaId', query);
    if (query.tipo) builder.andWhere('reconocimiento.tipo = :tipo', query);
    if (query.estado)
      builder.andWhere('reconocimiento.estado = :estado', query);
    const [data, total] = await builder.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string): Promise<Reconocimiento> {
    const reconocimiento = await this.repository.findOne({
      where: { id },
      relations: this.relations,
    });
    if (!reconocimiento) {
      throw new NotFoundException('Reconocimiento no encontrado');
    }
    return reconocimiento;
  }

  async generatePdf(id: string): Promise<{
    pdf: Buffer;
    filename: string;
  }> {
    const reconocimiento = await this.findOne(id);
    const emitted =
      Boolean(reconocimiento.primera_fecha_emision) ||
      reconocimiento.estado === ReconocimientoEstado.EMITIDO;
    // Una nueva versión activa reemplaza la anterior; las emisiones previas
    // pueden seguir usando su versión vinculada cuando ya no hay una activa.
    const plantilla =
      (await this.plantillas.findActive(
        reconocimiento.congreso.id,
        reconocimiento.tipo,
      )) ?? (emitted ? reconocimiento.plantilla : null);
    if (!plantilla) {
      throw new ConflictException(
        'Configura y activa una plantilla para este congreso y tipo antes de emitir el reconocimiento',
      );
    }
    try {
      const context =
        reconocimiento.render_context ?? this.renderContext(reconocimiento);
      const pdf = await this.renderer.render(
        reconocimiento.tipo,
        reconocimiento.nombre_destinatario,
        context,
        {
          image: await this.plantillas.loadImage(plantilla),
          layout: plantilla.layout,
        },
      );
      const hash = createHash('sha256').update(pdf).digest('hex');
      if (emitted) {
        await this.repository
          .createQueryBuilder()
          .update(Reconocimiento)
          .set({
            intentos: () => 'intentos + 1',
            ultimo_error: null,
            ultimo_pdf_sha256: hash,
            plantilla,
            render_context: context,
            pdf_emitido: null,
            primera_fecha_emision: () =>
              'COALESCE(primera_fecha_emision, CURRENT_TIMESTAMP)',
          })
          .where('id = :id', { id })
          .execute();
        return { pdf, filename: `reconocimiento-${id}.pdf` };
      }
      const update = await this.repository
        .createQueryBuilder()
        .update(Reconocimiento)
        .set({
          intentos: () => 'intentos + 1',
          estado: ReconocimientoEstado.EMITIDO,
          primera_fecha_emision: () =>
            'COALESCE(primera_fecha_emision, CURRENT_TIMESTAMP)',
          ultimo_error: null,
          ultimo_pdf_sha256: hash,
          pdf_emitido: null,
          plantilla,
          render_context: context,
        })
        .where('id = :id', { id })
        .andWhere('primera_fecha_emision IS NULL')
        .execute();
      if (update.affected === 0) {
        // Otra descarga emitió primero: consultar de nuevo la versión activa.
        return this.generatePdf(id);
      }
      return {
        pdf,
        filename: `reconocimiento-${id}.pdf`,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.stack : String(error);
      await this.repository
        .createQueryBuilder()
        .update(Reconocimiento)
        .set({
          intentos: () => 'intentos + 1',
          ultimo_error: detail,
        })
        .where('id = :id', { id })
        .execute();
      await this.repository
        .createQueryBuilder()
        .update(Reconocimiento)
        .set({ estado: ReconocimientoEstado.FALLIDO })
        .where('id = :id', { id })
        .andWhere('primera_fecha_emision IS NULL')
        .execute();
      throw new InternalServerErrorException(
        'No fue posible generar el reconocimiento',
      );
    }
  }
}
