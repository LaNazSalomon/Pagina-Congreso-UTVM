import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import {
  AccesoPropioOptions,
  PROPIO,
  PUBLICO,
  ROLES,
  SolicitudAutenticada,
} from './acceso.decorator';
import { RolPersonal } from './entities/personal.entity';
import { SesionesService } from './sesiones.service';

@Injectable()
export class AccesoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sesiones: SesionesService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<SolicitudAutenticada>();
    this.validarOrigen(request);
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, targets))
      return true;
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Cache-Control', 'no-store');
    const propio = this.reflector.getAllAndOverride<AccesoPropioOptions>(
      PROPIO,
      targets,
    );
    const personal = propio?.soloParticipante
      ? null
      : await this.sesiones.obtener(request, true);
    if (propio && personal?.sesion.usuario?.rol !== RolPersonal.ADMINISTRADOR) {
      const participante = await this.sesiones.obtener(request, false);
      if (!participante)
        throw new UnauthorizedException('Inicia sesión como participante.');
      const { sesion, token } = participante;
      const body = request.body as Record<string, unknown> | undefined;
      const tipo =
        propio.tipo ??
        (propio.tipoBody ? body?.[propio.tipoBody] : sesion.tipoParticipante);
      const id = propio.idParam
        ? request.params[propio.idParam]
        : propio.idBody
          ? body?.[propio.idBody]
          : sesion.referenciaId;
      if (
        tipo !== sesion.tipoParticipante ||
        String(id) !== sesion.referenciaId
      )
        throw new ForbiddenException(
          'Solo puedes realizar esta operación para tu propio registro.',
        );
      this.sesiones.validarCsrf(request, token, false);
      request.sesion = sesion;
      request.tokenSesion = token;
      return true;
    }
    if (!personal)
      throw new UnauthorizedException(
        'Inicia sesión con tu cuenta de personal.',
      );
    const roles = this.reflector.getAllAndOverride<RolPersonal[]>(
      ROLES,
      targets,
    ) ?? [RolPersonal.ADMINISTRADOR];
    const usuario = personal.sesion.usuario!;
    if (!propio && roles.length && !roles.includes(usuario.rol))
      throw new ForbiddenException(
        'Tu cuenta no tiene permiso para esta operación.',
      );
    this.sesiones.validarCsrf(request, personal.token, true);
    request.personal = usuario;
    request.sesion = personal.sesion;
    request.tokenSesion = personal.token;
    return true;
  }

  private validarOrigen(request: SolicitudAutenticada) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.get('origin');
    if (!origin) return;
    const allowed = [
      this.config.get<string>('FRONTEND_URL', 'http://localhost:9000'),
      this.config.get<string>('BACKEND_URL', 'http://localhost:3000'),
    ].map((value) => new URL(value).origin);
    if (!allowed.includes(origin))
      throw new ForbiddenException('Origen de la solicitud no permitido.');
  }
}
