import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';

import { ComprobanteService } from './comprobante.service';

@Controller('comprobantes')
export class ComprobanteController {
  constructor(private readonly comprobantes: ComprobanteService) {}

  @Get(':id/visualizar')
  async visualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const url = await this.comprobantes.getSignedUrl(id);
    response.redirect(url);
  }
}
