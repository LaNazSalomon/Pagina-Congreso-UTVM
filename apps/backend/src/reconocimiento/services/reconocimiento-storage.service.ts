import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../../archivo_multimedia/services/supabase-client.factory';

@Injectable()
export class ReconocimientoStorageService {
  private readonly logger = new Logger(ReconocimientoStorageService.name);
  private readonly supabase: SupabaseClient = createSupabaseClient();
  private readonly bucket =
    process.env.SUPABASE_RECOGNITIONS_BUCKET ?? 'congreso-reconocimientos';
  private bucketReady?: Promise<void>;

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= this.checkOrCreateBucket().catch((error: unknown) => {
      this.bucketReady = undefined;
      throw error;
    });
    return this.bucketReady;
  }

  private async checkOrCreateBucket(): Promise<void> {
    const { data, error } = await this.supabase.storage.getBucket(this.bucket);
    if (!error && data) {
      if (data.public) {
        throw new Error(`El bucket ${this.bucket} debe ser privado`);
      }
      return;
    }
    const missingBucket =
      error &&
      (Number(
        (error as { status?: number; statusCode?: string }).status ??
          (error as { statusCode?: string }).statusCode,
      ) === 404 ||
        error.message === 'Bucket not found');
    if (error && !missingBucket) throw error;
    const created = await this.supabase.storage.createBucket(this.bucket, {
      public: false,
      allowedMimeTypes: ['image/jpeg'],
      fileSizeLimit: 8 * 1024 * 1024,
    });
    if (created.error) {
      // Otra petición puede haberlo creado entre getBucket y createBucket.
      const current = await this.supabase.storage.getBucket(this.bucket);
      if (current.error || !current.data || current.data.public)
        throw created.error;
    }
  }

  async upload(path: string, image: Buffer): Promise<void> {
    try {
      await this.ensureBucket();
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .upload(path, image, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });
      if (error) throw error;
    } catch (error) {
      this.logger.error(`Fallo al subir plantilla: ${String(error)}`);
      throw new InternalServerErrorException(
        'No fue posible guardar la plantilla en Supabase',
      );
    }
  }

  async download(path: string): Promise<Buffer> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .download(path);
      if (error || !data) throw error ?? new Error('Archivo vacío');
      return Buffer.from(await data.arrayBuffer());
    } catch (error) {
      this.logger.error(`Fallo al leer plantilla: ${String(error)}`);
      throw new InternalServerErrorException(
        'No fue posible leer la plantilla de Supabase',
      );
    }
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .remove([path]);
    if (error) throw error;
  }
}
