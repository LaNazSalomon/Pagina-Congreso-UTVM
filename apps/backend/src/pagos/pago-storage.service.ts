import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../archivo_multimedia/services/supabase-client.factory';

@Injectable()
export class PagoStorageService {
  private readonly logger = new Logger(PagoStorageService.name);
  private readonly client: SupabaseClient = createSupabaseClient();
  private readonly bucket =
    process.env.SUPABASE_PAYMENT_BUCKET ?? 'congreso-instrucciones-pago';
  private bucketReady?: Promise<void>;

  private async ensureBucket(): Promise<void> {
    this.bucketReady ??= this.checkBucket().catch((error: unknown) => {
      this.bucketReady = undefined;
      throw error;
    });
    return this.bucketReady;
  }

  private async checkBucket(): Promise<void> {
    const { data, error } = await this.client.storage.getBucket(this.bucket);
    if (!error && data) {
      if (data.public)
        throw new Error('El bucket de instrucciones debe ser privado');
      return;
    }
    const missing =
      error &&
      (Number(
        (error as { status?: number; statusCode?: string }).status ??
          (error as { statusCode?: string }).statusCode,
      ) === 404 ||
        error.message === 'Bucket not found');
    if (error && !missing) throw error;
    const created = await this.client.storage.createBucket(this.bucket, {
      public: false,
      allowedMimeTypes: ['application/pdf'],
      fileSizeLimit: 8 * 1024 * 1024,
    });
    if (created.error) {
      const current = await this.client.storage.getBucket(this.bucket);
      if (current.error || !current.data || current.data.public)
        throw created.error;
    }
  }

  async upload(path: string, pdf: Buffer): Promise<void> {
    try {
      await this.ensureBucket();
      const { error } = await this.client.storage
        .from(this.bucket)
        .upload(path, pdf, {
          contentType: 'application/pdf',
          cacheControl: '0',
          upsert: false,
        });
      if (error) throw error;
    } catch (error) {
      this.logger.error(
        `No se pudieron subir las instrucciones: ${String(error)}`,
      );
      throw new InternalServerErrorException(
        'No fue posible guardar el PDF de pago',
      );
    }
  }

  async download(path: string): Promise<Buffer> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucket)
        .download(path);
      if (error || !data) throw error ?? new Error('PDF vacío');
      return Buffer.from(await data.arrayBuffer());
    } catch (error) {
      this.logger.error(
        `No se pudieron leer las instrucciones: ${String(error)}`,
      );
      throw new InternalServerErrorException(
        'No fue posible descargar el PDF de pago',
      );
    }
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([path]);
    if (error) throw error;
  }
}
