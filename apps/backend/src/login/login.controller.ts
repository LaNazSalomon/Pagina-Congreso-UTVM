import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AccesoPropio, Publico } from '../personal/acceso.decorator';
import type { SolicitudAutenticada } from '../personal/acceso.decorator';
import { SesionesService } from '../personal/sesiones.service';

import { LoginCorreoDto } from './dto/login-correo.dto';
import { VerificarCodigoDto } from './dto/verificar-codigo.dto';
import { LoginService } from './login.service';

@Controller('login')
export class LoginController {
  constructor(
    private readonly loginService: LoginService,
    private readonly sesiones: SesionesService,
  ) {}

  @Publico()
  @Post()
  login(@Body() dto: LoginCorreoDto) {
    return this.loginService.loginPorCorreo(dto.correo);
  }

  @Publico()
  @Post('verificar-codigo')
  async verificarCodigo(
    @Body() dto: VerificarCodigoDto,
    @Req() request: SolicitudAutenticada,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.loginService.verificarCodigo(
      dto.correo,
      dto.codigo,
    );
    await this.sesiones.revocarAnterior(request, false);
    const { csrfToken } = await this.sesiones.crearParticipante(
      result.tipo,
      String(result.participante.id),
      response,
    );
    return { ...result, csrfTokenParticipante: csrfToken };
  }

  @AccesoPropio({ soloParticipante: true })
  @Get('sesion')
  async sesion(@Req() request: SolicitudAutenticada) {
    const result = await this.loginService.obtenerParticipanteAutorizado(
      request.sesion!.tipoParticipante as 'EXTERNO' | 'NSU' | 'EMS' | 'UTVM',
      request.sesion!.referenciaId!,
    );
    return {
      ...result,
      csrfTokenParticipante: this.sesiones.csrf(request.tokenSesion!),
    };
  }

  @AccesoPropio({ soloParticipante: true })
  @Post('cerrar-sesion')
  async cerrar(
    @Req() request: SolicitudAutenticada,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sesiones.cerrar(request, response, false);
    return { mensaje: 'Sesión cerrada.' };
  }
}
