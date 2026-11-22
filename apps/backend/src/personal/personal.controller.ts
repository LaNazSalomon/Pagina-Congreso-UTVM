import {
  Body,
  Controller,
  Get,
  GoneException,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Publico, Roles } from './acceso.decorator';
import type { SolicitudAutenticada } from './acceso.decorator';
import {
  ActualizarPersonalDto,
  EntrarPersonalDto,
  CambiarContrasenaPersonalDto,
  CrearPersonalDto,
  CrearAdministradorInicialDto,
  TokenContrasenaPersonalDto,
  RestablecerContrasenaPersonalDto,
} from './dto/personal.dto';
import { PersonalService } from './personal.service';
import { SesionesService } from './sesiones.service';

@Controller('personal')
export class PersonalController {
  constructor(
    private readonly personal: PersonalService,
    private readonly sesiones: SesionesService,
  ) {}

  @Publico()
  @Get('configuracion-inicial')
  @Header('Cache-Control', 'no-store')
  estadoInicial() {
    return this.personal.estadoInicial();
  }

  @Publico()
  @Post('configuracion-inicial')
  registrarPrimerAdministrador(@Body() dto: CrearAdministradorInicialDto) {
    return this.personal.registrarPrimerAdministrador(dto);
  }

  @Publico()
  @Post('acceso/comprobar-enlace')
  @Header('Cache-Control', 'no-store')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  comprobarEnlace(@Body() dto: TokenContrasenaPersonalDto) {
    return this.personal.comprobarEnlace(dto.token);
  }

  @Publico()
  @Post('acceso/restablecer-contrasena')
  @Header('Cache-Control', 'no-store')
  @Throttle({ short: { limit: 5, ttl: 1000 }, long: { limit: 30, ttl: 60000 } })
  restablecer(@Body() dto: RestablecerContrasenaPersonalDto) {
    return this.personal.restablecerConEnlace(dto.token, dto.nuevaContrasena);
  }

  @Publico()
  @Post('acceso/codigo')
  solicitar() {
    throw new GoneException(
      'El personal ahora inicia sesión con correo y contraseña. Contacta a un administrador para restablecerla.',
    );
  }

  @Publico()
  @Post('acceso/verificar')
  verificarCodigoAnterior() {
    throw new GoneException(
      'Los códigos anteriores ya no permiten entrar. Usa tu correo y contraseña.',
    );
  }

  @Publico()
  @Post('acceso/entrar')
  @Throttle({ short: { limit: 5, ttl: 1000 }, long: { limit: 30, ttl: 60000 } })
  async verificar(
    @Body() dto: EntrarPersonalDto,
    @Req() request: SolicitudAutenticada,
    @Res({ passthrough: true }) response: Response,
  ) {
    const usuario = await this.personal.autenticar(dto.correo, dto.contrasena);
    if (usuario.cambiarContrasena) return { requiereCambioContrasena: true };
    await this.sesiones.revocarAnterior(request, true);
    const { csrfToken } = await this.sesiones.crearPersonal(usuario, response);
    return {
      usuario: this.personal.publico(usuario),
      csrfTokenPersonal: csrfToken,
    };
  }

  @Publico()
  @Post('acceso/cambiar-contrasena')
  @Throttle({ short: { limit: 5, ttl: 1000 }, long: { limit: 30, ttl: 60000 } })
  async cambiarContrasena(
    @Body() dto: CambiarContrasenaPersonalDto,
    @Req() request: SolicitudAutenticada,
    @Res({ passthrough: true }) response: Response,
  ) {
    const usuario = await this.personal.autenticar(
      dto.correo,
      dto.contrasena,
      dto.nuevaContrasena,
    );
    await this.sesiones.revocarAnterior(request, true);
    const { csrfToken } = await this.sesiones.crearPersonal(usuario, response);
    return {
      usuario: this.personal.publico(usuario),
      csrfTokenPersonal: csrfToken,
    };
  }

  // Transición para cuentas creadas con códigos que aún conservan una sesión.
  @Roles()
  @Post('contrasena-inicial')
  configurarContrasena(@Req() request: SolicitudAutenticada) {
    return this.personal.invitar(request.personal!.id, true);
  }

  @Roles()
  @Get('sesion')
  sesion(@Req() request: SolicitudAutenticada) {
    return {
      usuario: this.personal.publico(request.personal!),
      csrfTokenPersonal: this.sesiones.csrf(request.tokenSesion!),
    };
  }

  @Roles()
  @Post('cerrar-sesion')
  async cerrar(
    @Req() request: SolicitudAutenticada,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sesiones.cerrar(request, response, true);
    return { mensaje: 'Sesión cerrada.' };
  }

  @Get('usuarios') listar() {
    return this.personal.listar();
  }
  @Post('usuarios') crear(@Body() dto: CrearPersonalDto) {
    return this.personal.crear(dto);
  }
  @Patch('usuarios/:id') actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarPersonalDto,
  ) {
    return this.personal.actualizar(id, dto);
  }
  @Post('usuarios/:id/restablecer-contrasena') invitar(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.personal.invitar(id);
  }
}
