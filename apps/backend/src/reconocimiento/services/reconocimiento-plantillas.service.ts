import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { DataSource, Not, Repository } from 'typeorm';
import { Congreso } from '../../congreso/entities/congreso.entity';
import { Reconocimiento } from '../entities/reconocimiento.entity';
import { ReconocimientoPlantilla } from '../entities/reconocimiento-plantilla.entity';
import { ReconocimientoTipo } from '../enums/reconocimiento-tipo.enum';
import { ReconocimientoRendererService } from './reconocimiento-renderer.service';
import { ReconocimientoStorageService } from './reconocimiento-storage.service';
import { RecognitionBox, RecognitionLayout } from './reconocimiento-layout';

const PAGE_WIDTH = 768.25;
const PAGE_HEIGHT = 598.125;

function pageSizeForImage(width: number, height: number) {
  const scale = PAGE_WIDTH / Math.max(width, height);
  return { pageWidth: width * scale, pageHeight: height * scale };
}

@Injectable()
export class ReconocimientoPlantillasService implements OnModuleInit {
  private readonly logger = new Logger(ReconocimientoPlantillasService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ReconocimientoPlantilla)
    private readonly repository: Repository<ReconocimientoPlantilla>,
    private readonly renderer: ReconocimientoRendererService,
    private readonly storage: ReconocimientoStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Migra plantillas previas sin sobrescribir sus versiones ni exponer JPG públicos.
    const legacy = await this.repository
      .createQueryBuilder('plantilla')
      .addSelect('plantilla.imagen')
      .leftJoinAndSelect('plantilla.congreso', 'congreso')
      .where('plantilla.imagen_path IS NULL')
      .andWhere('plantilla.imagen IS NOT NULL')
      .getMany();
    for (const plantilla of legacy) {
      if (!plantilla.imagen) continue;
      const path = this.imagePath(
        plantilla.congreso.id,
        plantilla.tipo,
        plantilla.id,
      );
      let uploaded = false;
      try {
        await this.storage.upload(path, plantilla.imagen);
        uploaded = true;
        await this.repository.update(plantilla.id, {
          imagen_path: path,
          imagen: null,
        });
      } catch (error) {
        if (uploaded) {
          try {
            await this.storage.remove(path);
          } catch (cleanupError) {
            this.logger.error(
              `No se pudo limpiar ${path}: ${String(cleanupError)}`,
            );
          }
        }
        this.logger.error(
          `No se pudo migrar la plantilla ${plantilla.id}: ${String(error)}`,
        );
      }
    }
  }

  private imagePath(congresoId: string, tipo: ReconocimientoTipo, id: string) {
    return `congresos/${congresoId}/${tipo}/${id}.jpg`;
  }

  async list(congresoId: string, tipo?: ReconocimientoTipo) {
    const where = { congreso: { id: congresoId }, ...(tipo ? { tipo } : {}) };
    return this.repository.find({
      where,
      relations: { congreso: true },
      order: { created_at: 'DESC' },
    });
  }

  async findActive(congresoId: string, tipo: ReconocimientoTipo) {
    return this.repository
      .createQueryBuilder('plantilla')
      .where('plantilla.congreso_id = :congresoId', { congresoId })
      .andWhere('plantilla.tipo = :tipo', { tipo })
      .andWhere('plantilla.activa = true')
      .getOne();
  }

  async loadImage(plantilla: ReconocimientoPlantilla): Promise<Buffer> {
    if (plantilla.imagen_path)
      return this.storage.download(plantilla.imagen_path);
    const legacy = await this.repository
      .createQueryBuilder('plantilla')
      .addSelect('plantilla.imagen')
      .where('plantilla.id = :id', { id: plantilla.id })
      .getOne();
    if (legacy?.imagen) return legacy.imagen;
    throw new NotFoundException('Imagen de la plantilla no encontrada');
  }

  async create(
    congresoId: string,
    tipo: ReconocimientoTipo,
    rawLayout: string,
    image?: Express.Multer.File,
  ) {
    const checked = await this.checkImage(image);
    const layout = this.parseLayout(
      tipo,
      rawLayout,
      pageSizeForImage(checked.width, checked.height),
    );
    let uploadedPath: string | undefined;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const congreso = await manager
          .getRepository(Congreso)
          .createQueryBuilder('congreso')
          .setLock('pessimistic_write')
          .where('congreso.id = :congresoId', { congresoId })
          .getOne();
        if (!congreso) throw new NotFoundException('Congreso no encontrado');
        const last = await manager
          .getRepository(ReconocimientoPlantilla)
          .findOne({
            where: { congreso: { id: congresoId }, tipo },
            order: { version: 'DESC' },
          });
        const plantilla = manager
          .getRepository(ReconocimientoPlantilla)
          .create({
            id: randomUUID(),
            congreso,
            tipo,
            version: (last?.version ?? 0) + 1,
            layout,
            imagen: null,
            imagen_path: undefined,
            activa: false,
            activada_en: null,
          });
        uploadedPath = this.imagePath(congresoId, tipo, plantilla.id);
        await this.storage.upload(uploadedPath, checked.bytes);
        plantilla.imagen_path = uploadedPath;
        const saved = await manager.save(plantilla);
        return {
          id: saved.id,
          congreso: saved.congreso,
          tipo: saved.tipo,
          version: saved.version,
          layout: saved.layout,
          activa: saved.activa,
          activada_en: saved.activada_en,
          created_at: saved.created_at,
        };
      });
    } catch (error) {
      if (uploadedPath) {
        try {
          await this.storage.remove(uploadedPath);
        } catch (cleanupError) {
          this.logger.error(
            `No se pudo limpiar ${uploadedPath}: ${String(cleanupError)}`,
          );
        }
      }
      throw error;
    }
  }

  async activate(id: string) {
    return this.dataSource.transaction(async (manager) => {
      const plantilla = await manager
        .getRepository(ReconocimientoPlantilla)
        .findOne({
          where: { id },
          relations: { congreso: true },
        });
      if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
      await manager
        .getRepository(Congreso)
        .createQueryBuilder('congreso')
        .setLock('pessimistic_write')
        .where('congreso.id = :id', { id: plantilla.congreso.id })
        .getOne();
      await manager.getRepository(ReconocimientoPlantilla).update(
        {
          congreso: { id: plantilla.congreso.id },
          tipo: plantilla.tipo,
          activa: true,
        },
        { activa: false },
      );
      await manager.getRepository(ReconocimientoPlantilla).update(id, {
        activa: true,
        activada_en: new Date(),
      });
      return manager.getRepository(ReconocimientoPlantilla).findOneOrFail({
        where: { id },
        relations: { congreso: true },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const imagePath = await this.dataSource.transaction(async (manager) => {
      const templates = manager.getRepository(ReconocimientoPlantilla);
      const plantilla = await templates.findOne({
        where: { id },
        relations: { congreso: true },
      });
      if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
      await manager
        .getRepository(Congreso)
        .createQueryBuilder('congreso')
        .setLock('pessimistic_write')
        .where('congreso.id = :id', { id: plantilla.congreso.id })
        .getOne();

      const reconocimientos = manager.getRepository(Reconocimiento);
      const vinculados = await reconocimientos.count({
        where: { plantilla: { id } },
      });
      if (vinculados) {
        const reemplazo = await templates.findOne({
          where: {
            id: Not(id),
            congreso: { id: plantilla.congreso.id },
            tipo: plantilla.tipo,
            activa: true,
          },
        });
        if (!reemplazo) {
          throw new ConflictException(
            'Esta versión está vinculada a reconocimientos. Activa otra versión antes de eliminarla.',
          );
        }
        await reconocimientos
          .createQueryBuilder()
          .update(Reconocimiento)
          .set({ plantilla: reemplazo })
          .where('plantilla_id = :id', { id })
          .execute();
      }
      await templates.delete(id);
      return plantilla.imagen_path;
    });
    if (imagePath) {
      try {
        await this.storage.remove(imagePath);
      } catch (error) {
        // La versión ya desapareció de la base: no presentar un error que
        // invite al administrador a repetir una eliminación completada.
        this.logger.error(
          `No se pudo limpiar la imagen de la plantilla ${id}: ${String(error)}`,
        );
      }
    }
  }

  async preview(
    tipo: ReconocimientoTipo,
    rawLayout: string,
    image?: Express.Multer.File,
  ) {
    const checked = await this.checkImage(image);
    const layout = this.parseLayout(
      tipo,
      rawLayout,
      pageSizeForImage(checked.width, checked.height),
    );
    return this.renderExample(tipo, layout, checked.bytes);
  }

  async previewSaved(id: string): Promise<Buffer> {
    const plantilla = await this.repository.findOne({ where: { id } });
    if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
    return this.renderExample(
      plantilla.tipo,
      plantilla.layout,
      await this.loadImage(plantilla),
    );
  }

  private renderExample(
    tipo: ReconocimientoTipo,
    layout: RecognitionLayout,
    image: Buffer,
  ): Promise<Buffer> {
    return this.renderer.render(
      tipo,
      'María José Hernández Pérez',
      {
        participacion: 'Participación como evaluador del Hackatón',
        equipo: 'Equipo de ejemplo',
        resultado: 'Primer lugar',
      },
      { image, layout },
    );
  }

  parseLayout(
    tipo: ReconocimientoTipo,
    raw: string,
    page: { pageWidth: number; pageHeight: number } = {
      pageWidth: PAGE_WIDTH,
      pageHeight: PAGE_HEIGHT,
    },
  ): RecognitionLayout {
    if (!Object.values(ReconocimientoTipo).includes(tipo))
      throw new BadRequestException('Tipo de reconocimiento inválido');
    let input: unknown;
    try {
      input = JSON.parse(raw) as unknown;
    } catch {
      throw new BadRequestException(
        'La configuración de posiciones no es JSON válido',
      );
    }
    if (!input || typeof input !== 'object')
      throw new BadRequestException('Configuración de posiciones inválida');
    const value = input as Record<string, unknown>;
    const expected =
      tipo === ReconocimientoTipo.HACKATON_EVALUADOR
        ? 1
        : tipo === ReconocimientoTipo.HACKATON_PREMIACION
          ? 2
          : 0;
    if (
      !Array.isArray(value.detailBoxes) ||
      value.detailBoxes.length !== expected
    )
      throw new BadRequestException(
        `Este reconocimiento requiere ${expected} campos de detalle`,
      );
    return {
      nameBox: this.parseBox(value.nameBox, page),
      detailBoxes: value.detailBoxes.map((box: unknown) =>
        this.parseBox(box, page),
      ),
      ...page,
    };
  }

  private parseBox(
    input: unknown,
    page: { pageWidth: number; pageHeight: number },
  ): RecognitionBox {
    if (!input || typeof input !== 'object')
      throw new BadRequestException('La posición del texto es inválida');
    const box = input as Record<string, unknown>;
    for (const key of ['x', 'yFromTop', 'width', 'height', 'size']) {
      if (typeof box[key] !== 'number' || !Number.isFinite(box[key]))
        throw new BadRequestException(`La propiedad ${key} debe ser un número`);
    }
    const { x, yFromTop, width, height, size } =
      box as unknown as RecognitionBox;
    if (
      x < 0 ||
      yFromTop < 0 ||
      width < 20 ||
      height < 12 ||
      size < 10 ||
      size > 48 ||
      x + width > page.pageWidth + 0.01 ||
      yFromTop + height > page.pageHeight + 0.01
    )
      throw new BadRequestException(
        'El texto debe caber dentro del reconocimiento',
      );
    return { x, yFromTop, width, height, size };
  }

  private async checkImage(image?: Express.Multer.File): Promise<{
    bytes: Buffer;
    width: number;
    height: number;
  }> {
    if (!image?.buffer || !image.buffer.length)
      throw new BadRequestException('Selecciona una imagen JPG');
    if (image.size > 8 * 1024 * 1024)
      throw new BadRequestException('La imagen debe pesar menos de 8 MB');
    const bytes = image.buffer;
    if (
      image.mimetype !== 'image/jpeg' ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8
    )
      throw new BadRequestException('Solo se aceptan imágenes JPG');
    try {
      const pdf = await PDFDocument.create();
      const embedded = await pdf.embedJpg(bytes);
      return {
        bytes,
        width: embedded.width,
        height: embedded.height,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('El archivo JPG no se puede leer');
    }
  }
}
