import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { IsNull, Repository } from 'typeorm';
import { SesionAcceso, UsuarioPersonal } from './entities/personal.entity';

const DURACION = 12 * 60 * 60 * 1000;
const COOKIE_PERSONAL = 'congreso_personal';
const COOKIE_PARTICIPANTE = 'congreso_participante';

@Injectable()
export class SesionesService {
  constructor(
    @InjectRepository(SesionAcceso)
    private readonly sesiones: Repository<SesionAcceso>,
    private readonly config: ConfigService,
  ) {}

  async crearPersonal(usuario: UsuarioPersonal, response: Response) {
    return this.crear(
      {
        usuarioId: usuario.id,
        version: usuario.version,
        tipoParticipante: null,
        referenciaId: null,
      },
      response,
      true,
    );
  }

  async crearParticipante(
    tipo: string,
    referenciaId: string,
    response: Response,
  ) {
    return this.crear(
      { usuarioId: null, version: 0, tipoParticipante: tipo, referenciaId },
      response,
      false,
    );
  }

  private async crear(
    identidad: Partial<SesionAcceso>,
    response: Response,
    personal: boolean,
  ) {
    const token = randomBytes(32).toString('hex');
    const sesion = await this.sesiones.save(
      this.sesiones.create({
        ...identidad,
        tokenHash: this.hash(token),
        expiraEn: new Date(Date.now() + DURACION),
        revocadaEn: null,
      }),
    );
    response.cookie(personal ? COOKIE_PERSONAL : COOKIE_PARTICIPANTE, token, {
      ...this.cookieOptions(),
      maxAge: DURACION,
    });
    response.setHeader('Cache-Control', 'no-store');
    return { sesion, csrfToken: this.csrf(token) };
  }

  async obtener(request: Request, personal: boolean) {
    const token = this.token(request, personal);
    if (!token) return null;
    const sesion = await this.sesiones.findOne({
      where: { tokenHash: this.hash(token), revocadaEn: IsNull() },
      relations: { usuario: true },
    });
    if (!sesion || sesion.expiraEn.getTime() <= Date.now()) return null;
    if (personal) {
      if (
        !sesion.usuario?.activo ||
        !sesion.usuario.correoVerificado ||
        sesion.version !== sesion.usuario.version
      )
        return null;
    } else if (
      sesion.usuarioId ||
      !sesion.tipoParticipante ||
      !sesion.referenciaId
    )
      return null;
    return { sesion, token };
  }

  async cerrar(request: Request, response: Response, personal: boolean) {
    const token = this.token(request, personal);
    if (token)
      await this.sesiones.update(
        { tokenHash: this.hash(token), revocadaEn: IsNull() },
        { revocadaEn: new Date() },
      );
    response.clearCookie(
      personal ? COOKIE_PERSONAL : COOKIE_PARTICIPANTE,
      this.cookieOptions(),
    );
  }

  async revocarAnterior(request: Request, personal: boolean) {
    const token = this.token(request, personal);
    if (token)
      await this.sesiones.update(
        { tokenHash: this.hash(token), revocadaEn: IsNull() },
        { revocadaEn: new Date() },
      );
  }

  csrf(token: string) {
    return createHmac('sha256', token).update('congreso-csrf-v1').digest('hex');
  }

  validarCsrf(request: Request, token: string, personal: boolean) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const recibido = request.get(
      personal ? 'x-csrf-token' : 'x-participante-csrf',
    );
    const esperado = this.csrf(token);
    if (
      !recibido ||
      !/^[a-f0-9]{64}$/.test(recibido) ||
      !timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado))
    )
      throw new UnauthorizedException(
        'La sesión debe actualizarse. Vuelve a iniciar sesión.',
      );
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private token(request: Request, personal: boolean): string | null {
    const name = personal ? COOKIE_PERSONAL : COOKIE_PARTICIPANTE;
    const value = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api',
    };
  }
}
