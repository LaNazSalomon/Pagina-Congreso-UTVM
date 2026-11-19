import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ReconocimientoTipo } from './enums/reconocimiento-tipo.enum';
import { ReconocimientoPlantillasService } from './services/reconocimiento-plantillas.service';

@Controller('reconocimientos/plantillas')
export class ReconocimientoPlantillasController {
  constructor(private readonly plantillas: ReconocimientoPlantillasService) {}

  @Get()
  list(
    @Query('congresoId', ParseUUIDPipe) congresoId: string,
    @Query('tipo', new ParseEnumPipe(ReconocimientoTipo, { optional: true }))
    tipo?: ReconocimientoTipo,
  ) {
    return this.plantillas.list(congresoId, tipo);
  }

  @Post('previsualizar')
  @UseInterceptors(
    FileInterceptor('imagen', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  async preview(
    @Body('tipo', new ParseEnumPipe(ReconocimientoTipo))
    tipo: ReconocimientoTipo,
    @Body('layout') layout: string,
    @UploadedFile() imagen: Express.Multer.File,
    @Res() response: Response,
  ) {
    const pdf = await this.plantillas.preview(tipo, layout, imagen);
    response.type('application/pdf').send(pdf);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('imagen', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  create(
    @Body('congresoId', ParseUUIDPipe) congresoId: string,
    @Body('tipo', new ParseEnumPipe(ReconocimientoTipo))
    tipo: ReconocimientoTipo,
    @Body('layout') layout: string,
    @UploadedFile() imagen: Express.Multer.File,
  ) {
    return this.plantillas.create(congresoId, tipo, layout, imagen);
  }

  @Get(':id/previsualizar')
  async previewSaved(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ) {
    const pdf = await this.plantillas.previewSaved(id);
    response.type('application/pdf').send(pdf);
  }

  @Post(':id/activar')
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.plantillas.activate(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.plantillas.remove(id);
  }
}
