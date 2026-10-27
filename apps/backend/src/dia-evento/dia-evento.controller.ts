import { Publico } from '../personal/acceso.decorator';
import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import { DiaEventoResponse, DiaEventoService } from './dia-evento.service';

@Controller('congresos')
export class DiaEventoController {
  constructor(private readonly dias: DiaEventoService) {}

  @Publico()
  @Get('opciones-registro')
  opcionesRegistro() {
    return this.dias.opcionesRegistro();
  }

  @Post(':congresoId/dias-evento/generar')
  generar(
    @Param('congresoId', ParseUUIDPipe) congresoId: string,
  ): Promise<DiaEventoResponse[]> {
    return this.dias.generar(congresoId);
  }

  @Get(':congresoId/dias-evento')
  findAll(
    @Param('congresoId', ParseUUIDPipe) congresoId: string,
  ): Promise<DiaEventoResponse[]> {
    return this.dias.findByCongreso(congresoId);
  }
}
