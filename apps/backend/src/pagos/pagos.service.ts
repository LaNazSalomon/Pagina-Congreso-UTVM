import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { Congreso } from '../congreso/entities/congreso.entity';
import { REGISTRO_TARIFAS } from '../dia-evento/registro-tarifas.constant';
import { ActualizarPagoDto } from './dto/actualizar-pago.dto';
import { PagoConfiguracion } from './entities/pago-configuracion.entity';
import { PagoDocumento } from './entities/pago-documento.entity';
import { PagoStorageService } from './pago-storage.service';

@Injectable()
export class PagosService {
  constructor(
    @InjectRepository(PagoConfiguracion)
    private readonly configuraciones: Repository<PagoConfiguracion>,
    @InjectRepository(PagoDocumento)
    private readonly documentos: Repository<PagoDocumento>,
    @InjectRepository(Congreso)
    private readonly congresos: Repository<Congreso>,
    private readonly dataSource: DataSource,
    private readonly storage: PagoStorageService,
  ) {}

  private async congreso(id: string): Promise<Congreso> {
    const congreso = await this.congresos.findOneBy({ id });
    if (!congreso) throw new NotFoundException('Congreso no encontrado');
    return congreso;
  }

  async tarifas(congresoId: string): Promise<{ EXTERNO: number; NSU: number }> {
    const config = await this.configuraciones.findOneBy({
      congreso: { id: congresoId },
    });
    return {
      EXTERNO: Number(config?.tarifa_externo ?? REGISTRO_TARIFAS.EXTERNO),
      NSU: Number(config?.tarifa_nsu ?? REGISTRO_TARIFAS.NSU),
    };
  }

  async publico(congresoId: string) {
    await this.congreso(congresoId);
    const [config, activo] = await Promise.all([
      this.configuraciones.findOneBy({ congreso: { id: congresoId } }),
      this.documentos.findOne({
        where: { congreso: { id: congresoId }, activo: true },
        order: { version: 'DESC' },
      }),
    ]);
    return {
      tarifas: {
        EXTERNO: Number(config?.tarifa_externo ?? REGISTRO_TARIFAS.EXTERNO),
        NSU: Number(config?.tarifa_nsu ?? REGISTRO_TARIFAS.NSU),
      },
      banco: config?.banco ?? null,
      beneficiario: config?.beneficiario ?? null,
      clabe: config?.clabe ?? null,
      numero_tarjeta: config?.numero_tarjeta ?? null,
      concepto: config?.concepto ?? null,
      actualizado_en: config?.updated_at ?? null,
      instrucciones: activo
        ? {
            id: activo.id,
            version: activo.version,
            activado_en: activo.activado_en,
          }
        : null,
    };
  }

  async administrar(congresoId: string) {
    const [publico, documentos] = await Promise.all([
      this.publico(congresoId),
      this.documentos.find({
        where: { congreso: { id: congresoId } },
        order: { version: 'DESC' },
      }),
    ]);
    return {
      ...publico,
      documentos: documentos.map(
        ({ id, version, activo, activado_en, created_at }) => ({
          id,
          version,
          activo,
          activado_en,
          created_at,
        }),
      ),
    };
  }

  async actualizar(congresoId: string, dto: ActualizarPagoDto) {
    await this.dataSource.transaction(async (manager) => {
      const congreso = await manager
        .getRepository(Congreso)
        .createQueryBuilder('congreso')
        .setLock('pessimistic_write')
        .where('congreso.id = :congresoId', { congresoId })
        .getOne();
      if (!congreso) throw new NotFoundException('Congreso no encontrado');
      const repository = manager.getRepository(PagoConfiguracion);
      const current = await repository.findOneBy({
        congreso: { id: congresoId },
      });
      await repository.save(
        repository.create({
          ...(current ?? {}),
          congreso,
          tarifa_externo: dto.tarifa_externo,
          tarifa_nsu: dto.tarifa_nsu,
          banco:
            dto.banco === undefined
              ? (current?.banco ?? null)
              : dto.banco.trim() || null,
          beneficiario:
            dto.beneficiario === undefined
              ? (current?.beneficiario ?? null)
              : dto.beneficiario.trim() || null,
          clabe:
            dto.clabe === undefined
              ? (current?.clabe ?? null)
              : dto.clabe.trim() || null,
          numero_tarjeta:
            dto.numero_tarjeta === undefined
              ? (current?.numero_tarjeta ?? null)
              : dto.numero_tarjeta.trim() || null,
          concepto:
            dto.concepto === undefined
              ? (current?.concepto ?? null)
              : dto.concepto.trim() || null,
        }),
      );
    });
    return this.administrar(congresoId);
  }

  async subir(congresoId: string, archivo?: Express.Multer.File) {
    if (
      !archivo ||
      archivo.size < 8 ||
      archivo.size > 8 * 1024 * 1024 ||
      archivo.mimetype !== 'application/pdf' ||
      archivo.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new BadRequestException('Selecciona un PDF válido de hasta 8 MB.');
    }
    const path = `congresos/${congresoId}/${randomUUID()}.pdf`;
    let uploaded = false;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const congreso = await manager
          .getRepository(Congreso)
          .createQueryBuilder('congreso')
          .setLock('pessimistic_write')
          .where('congreso.id = :congresoId', { congresoId })
          .getOne();
        if (!congreso) throw new NotFoundException('Congreso no encontrado');
        const latest = await manager.getRepository(PagoDocumento).findOne({
          where: { congreso: { id: congresoId } },
          order: { version: 'DESC' },
        });
        await this.storage.upload(path, archivo.buffer);
        uploaded = true;
        return manager.getRepository(PagoDocumento).save(
          manager.getRepository(PagoDocumento).create({
            congreso,
            version: (latest?.version ?? 0) + 1,
            path,
            activo: false,
            activado_en: null,
          }),
        );
      });
    } catch (error) {
      if (uploaded) await this.storage.remove(path).catch(() => undefined);
      throw error;
    }
  }

  async activar(id: string) {
    return this.dataSource.transaction(async (manager) => {
      const target = await manager
        .getRepository(PagoDocumento)
        .findOne({ where: { id }, relations: { congreso: true } });
      if (!target) throw new NotFoundException('PDF de pago no encontrado');
      await manager
        .getRepository(Congreso)
        .createQueryBuilder('congreso')
        .setLock('pessimistic_write')
        .where('congreso.id = :id', { id: target.congreso.id })
        .getOneOrFail();
      // Comprobar el archivo antes de dejarlo disponible públicamente.
      await this.storage.download(target.path);
      await manager
        .getRepository(PagoDocumento)
        .update(
          { congreso: { id: target.congreso.id }, activo: true },
          { activo: false },
        );
      target.activo = true;
      target.activado_en = new Date();
      await manager.getRepository(PagoDocumento).save(target);
      return { id: target.id, version: target.version, activo: true };
    });
  }

  async descargarActivo(congresoId: string): Promise<Buffer> {
    const document = await this.documentos.findOne({
      where: { congreso: { id: congresoId }, activo: true },
      order: { version: 'DESC' },
    });
    if (!document)
      throw new NotFoundException(
        'Aún no hay instrucciones de pago para este congreso',
      );
    return this.storage.download(document.path);
  }

  async descargarVersion(id: string): Promise<Buffer> {
    const document = await this.documentos.findOneBy({ id });
    if (!document) throw new NotFoundException('PDF de pago no encontrado');
    return this.storage.download(document.path);
  }
}
