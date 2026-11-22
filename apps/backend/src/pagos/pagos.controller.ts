import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Publico } from '../personal/acceso.decorator';
import { ActualizarPagoDto } from './dto/actualizar-pago.dto';
import { PagosService } from './pagos.service';

@Controller('pagos')
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Publico()
  @Get(':congresoId/publico')
  publico(@Param('congresoId', ParseUUIDPipe) congresoId: string) {
    return this.pagos.publico(congresoId);
  }

  @Publico()
  @Get(':congresoId/instrucciones')
  async instrucciones(
    @Param('congresoId', ParseUUIDPipe) congresoId: string,
    @Res() response: Response,
  ) {
    const pdf = await this.pagos.descargarActivo(congresoId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response
      .type('application/pdf')
      .attachment('instrucciones-de-pago.pdf')
      .send(pdf);
  }

  @Get('documentos/:id/archivo')
  async archivo(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const pdf = await this.pagos.descargarVersion(id);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response
      .type('application/pdf')
      .attachment('instrucciones-de-pago.pdf')
      .send(pdf);
  }

  @Post('documentos/:id/activar')
  activar(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagos.activar(id);
  }

  @Get(':congresoId')
  administrar(@Param('congresoId', ParseUUIDPipe) congresoId: string) {
    return this.pagos.administrar(congresoId);
  }

  @Patch(':congresoId')
  actualizar(
    @Param('congresoId', ParseUUIDPipe) congresoId: string,
    @Body() dto: ActualizarPagoDto,
  ) {
    return this.pagos.actualizar(congresoId, dto);
  }

  @Post(':congresoId/documentos')
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  subir(
    @Param('congresoId', ParseUUIDPipe) congresoId: string,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    return this.pagos.subir(congresoId, archivo);
  }
}
