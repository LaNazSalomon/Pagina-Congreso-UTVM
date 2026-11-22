import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../personal/acceso.decorator';
import type { SolicitudAutenticada } from '../personal/acceso.decorator';
import { RolPersonal } from '../personal/entities/personal.entity';

import { QrAccesoResponseDto } from './dto/qr-acceso-response.dto';
import { QrTokenParamDto } from './dto/qr-token-param.dto';
import { QrAccesoValidationService } from './services/qr-acceso-validation.service';

@Roles(RolPersonal.VALIDADOR)
@Controller('acceso/qr')
export class QrAccesoController {
  constructor(private readonly validation: QrAccesoValidationService) {}

  @Get(':token')
  inspect(@Param() params: QrTokenParamDto): Promise<QrAccesoResponseDto> {
    return this.validation.inspect(params.token);
  }

  @Post(':token/confirmar')
  confirm(
    @Param() params: QrTokenParamDto,
    @Req() request: SolicitudAutenticada,
  ): Promise<QrAccesoResponseDto> {
    return this.validation.confirm(params.token, request.personal!.id);
  }
}
