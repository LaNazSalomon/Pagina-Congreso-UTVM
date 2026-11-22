import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { CorreoService } from '../correo/correo.service';
import { comprobarContrasena, hashContrasena } from './contrasena';
import {
  ActualizarPersonalDto,
  CrearAdministradorInicialDto,
  CrearPersonalDto,
} from './dto/personal.dto';
import {
  CodigoPersonal,
  EnlaceContrasenaPersonal,
  RolPersonal,
  SesionAcceso,
  UsuarioPersonal,
} from './entities/personal.entity';

const MINUTOS_ENLACE = 30;
const MENSAJE_ENLACE_INVALIDO =
  'El enlace no es válido, ya fue utilizado o venció. Solicita otro a un administrador.';

@Injectable()
export class PersonalService {
  private readonly logger = new Logger(PersonalService.name);
  constructor(
    @InjectRepository(UsuarioPersonal)
    private readonly usuarios: Repository<UsuarioPersonal>,
    private readonly dataSource: DataSource,
    private readonly correo: CorreoService,
  ) {}

  listar() {
    return this.usuarios
      .find({ order: { creadoEn: 'ASC' } })
      .then((items) => items.map((item) => this.publico(item)));
  }

  async estadoInicial() {
    return {
      requiereAdministradorInicial: (await this.usuarios.count()) === 0,
    };
  }

  async registrarPrimerAdministrador(dto: CrearAdministradorInicialDto) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('gestion-personal'))",
      );
      if ((await manager.count(UsuarioPersonal)) > 0) {
        throw new ConflictException(
          'La primera cuenta ya existe. Inicia sesión; las siguientes cuentas se crean desde Usuarios y roles.',
        );
      }
      const usuario = await manager.save(
        manager.create(UsuarioPersonal, {
          nombre: dto.nombre.trim(),
          correo: dto.correo.trim().toLowerCase(),
          rol: RolPersonal.ADMINISTRADOR,
          activo: true,
          correoVerificado: false,
          version: 1,
        }),
      );
      // Si SMTP falla, se revierte esta alta inicial para permitir otro intento.
      await this.emitirEnlace(manager, usuario);
    });
    return {
      mensaje:
        'Cuenta administradora creada. Revisa tu correo y abre el enlace para elegir tu contraseña.',
    };
  }

  publico(usuario: UsuarioPersonal) {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      activo: usuario.activo,
      correoVerificado: usuario.correoVerificado,
      creadoEn: usuario.creadoEn,
      contrasenaConfigurada: usuario.contrasenaConfigurada,
      cambiarContrasena: usuario.cambiarContrasena,
    };
  }

  async crear(dto: CrearPersonalDto) {
    let usuario: UsuarioPersonal;
    try {
      usuario = await this.dataSource.transaction(async (manager) => {
        await manager.query(
          "SELECT pg_advisory_xact_lock(hashtext('gestion-personal'))",
        );
        return manager.save(
          manager.create(UsuarioPersonal, {
            ...dto,
            correo: dto.correo.trim().toLowerCase(),
            activo: true,
            correoVerificado: false,
            version: 1,
          }),
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'Ya existe una cuenta de personal con ese correo.',
        );
      throw error;
    }
    try {
      await this.invitar(usuario.id);
      usuario = await this.usuarios.findOneByOrFail({ id: usuario.id });
      return {
        usuario: this.publico(usuario),
        invitacionEnviada: true,
        mensaje: 'Cuenta creada. Se envió un enlace para elegir su contraseña.',
      };
    } catch {
      this.logger.warn(
        'La cuenta se creó pero su invitación requiere reintento.',
      );
      return {
        usuario: this.publico(usuario),
        invitacionEnviada: false,
        mensaje:
          'La cuenta quedó creada, pero no pudimos enviar el enlace. Puedes reenviarlo desde la lista.',
      };
    }
  }

  async actualizar(id: string, dto: ActualizarPersonalDto) {
    const usuario = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('gestion-personal'))",
      );
      const usuario = await manager.findOne(UsuarioPersonal, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!usuario) throw new NotFoundException('Cuenta no encontrada.');
      if (
        usuario.activo &&
        usuario.rol === RolPersonal.ADMINISTRADOR &&
        (dto.activo === false ||
          (dto.rol && dto.rol !== RolPersonal.ADMINISTRADOR))
      ) {
        const administradores = await manager.count(UsuarioPersonal, {
          where: {
            activo: true,
            rol: RolPersonal.ADMINISTRADOR,
            ...(usuario.correoVerificado ? { correoVerificado: true } : {}),
          },
        });
        if (administradores <= 1)
          throw new BadRequestException(
            'Debes conservar al menos un administrador activo con acceso confirmado.',
          );
      }
      const revocar =
        (dto.rol !== undefined && dto.rol !== usuario.rol) ||
        (dto.activo !== undefined && dto.activo !== usuario.activo);
      Object.assign(usuario, dto);
      if (revocar) {
        usuario.version += 1;
        await manager.update(
          SesionAcceso,
          { usuarioId: id, revocadaEn: IsNull() },
          { revocadaEn: new Date() },
        );
        await manager.update(
          CodigoPersonal,
          { usuarioId: id },
          { utilizado: true },
        );
      }
      return manager.save(usuario);
    });
    return this.publico(usuario);
  }

  async invitar(id: string, soloSinContrasena = false) {
    return this.dataSource.transaction(async (manager) => {
      const usuario = await manager.findOne(UsuarioPersonal, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!usuario) throw new NotFoundException('Cuenta no encontrada.');
      if (!usuario.activo)
        throw new BadRequestException(
          'Activa la cuenta antes de enviar el enlace de contraseña.',
        );
      if (soloSinContrasena && usuario.contrasenaConfigurada)
        throw new ConflictException(
          'Tu cuenta ya tiene contraseña. El administrador puede restablecerla desde Usuarios y roles.',
        );
      await this.emitirEnlace(manager, usuario);
      return {
        mensaje:
          'Se envió el enlace de contraseña. La contraseña actual seguirá funcionando hasta que se guarde la nueva.',
      };
    });
  }

  private async emitirEnlace(manager: EntityManager, usuario: UsuarioPersonal) {
    const token = randomBytes(32).toString('base64url');
    try {
      await this.correo.enviarEnlaceContrasenaPersonal(
        usuario.correo,
        token,
        MINUTOS_ENLACE,
      );
    } catch {
      this.logger.error(
        'No fue posible enviar el enlace de contraseña del personal.',
      );
      throw new ServiceUnavailableException(
        'No se pudo enviar el enlace. Intenta de nuevo; tu contraseña y cualquier enlace anterior siguen vigentes.',
      );
    }
    await manager.save(
      manager.create(EnlaceContrasenaPersonal, {
        usuarioId: usuario.id,
        tokenHash: this.hashToken(token),
        version: usuario.version,
        expiraEn: new Date(Date.now() + MINUTOS_ENLACE * 60 * 1000),
        enviadoEn: new Date(),
        utilizado: false,
      }),
    );
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private enlaceVigente(
    enlace: EnlaceContrasenaPersonal | null,
    usuario: UsuarioPersonal | null,
  ) {
    return (
      enlace &&
      usuario?.activo &&
      !enlace.utilizado &&
      enlace.version === usuario.version &&
      enlace.expiraEn.getTime() > Date.now()
    );
  }

  async comprobarEnlace(token: string) {
    const enlace = await this.dataSource
      .getRepository(EnlaceContrasenaPersonal)
      .findOne({
        where: { tokenHash: this.hashToken(token) },
        relations: { usuario: true },
      });
    if (!this.enlaceVigente(enlace, enlace?.usuario || null))
      throw new UnauthorizedException(MENSAJE_ENLACE_INVALIDO);
    return { valido: true };
  }

  async restablecerConEnlace(token: string, nuevaContrasena: string) {
    const tokenHash = this.hashToken(token);
    const referencia = await this.dataSource
      .getRepository(EnlaceContrasenaPersonal)
      .findOneBy({ tokenHash });
    if (!referencia) throw new UnauthorizedException(MENSAJE_ENLACE_INVALIDO);
    const valido = await this.dataSource.transaction(async (manager) => {
      // Mismo orden de bloqueo que en el envío: primero usuario, luego enlace.
      const usuario = await manager.findOne(UsuarioPersonal, {
        where: { id: referencia.usuarioId },
        lock: { mode: 'pessimistic_write' },
      });
      const enlace = await manager.findOne(EnlaceContrasenaPersonal, {
        where: { usuarioId: referencia.usuarioId, tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!usuario || !enlace || !this.enlaceVigente(enlace, usuario))
        return false;
      usuario.contrasenaHash = await hashContrasena(nuevaContrasena);
      usuario.contrasenaConfigurada = true;
      usuario.cambiarContrasena = false;
      usuario.contrasenaTemporalExpiraEn = null;
      usuario.correoVerificado = true;
      usuario.intentosAcceso = 0;
      usuario.bloqueoHasta = null;
      usuario.version += 1;
      enlace.utilizado = true;
      await manager.save(usuario);
      await manager.save(enlace);
      await manager.update(
        SesionAcceso,
        { usuarioId: usuario.id, revocadaEn: IsNull() },
        { revocadaEn: new Date() },
      );
      await manager.update(
        CodigoPersonal,
        { usuarioId: usuario.id },
        { utilizado: true },
      );
      return true;
    });
    if (!valido) throw new UnauthorizedException(MENSAJE_ENLACE_INVALIDO);
    return {
      mensaje:
        'Tu contraseña quedó guardada. Ya puedes iniciar sesión con tu correo y nueva contraseña.',
    };
  }

  async autenticar(
    correo: string,
    contrasena: string,
    nuevaContrasena?: string,
  ) {
    const resultado = await this.dataSource.transaction(async (manager) => {
      const usuario = await manager
        .getRepository(UsuarioPersonal)
        .createQueryBuilder('u')
        .addSelect('u.contrasenaHash')
        .where('u.correo = :correo', { correo: correo.trim().toLowerCase() })
        .setLock('pessimistic_write')
        .getOne();
      const bloqueado =
        usuario?.bloqueoHasta && usuario.bloqueoHasta.getTime() > Date.now();
      const coincide = await comprobarContrasena(
        contrasena,
        usuario?.contrasenaHash || null,
      );
      if (!usuario?.activo || bloqueado) return null;
      if (
        !coincide ||
        (usuario.cambiarContrasena &&
          (!usuario.contrasenaTemporalExpiraEn ||
            usuario.contrasenaTemporalExpiraEn.getTime() <= Date.now()))
      ) {
        if (
          usuario.bloqueoHasta &&
          usuario.bloqueoHasta.getTime() <= Date.now()
        ) {
          usuario.intentosAcceso = 0;
          usuario.bloqueoHasta = null;
        }
        usuario.intentosAcceso += 1;
        if (usuario.intentosAcceso >= 10)
          usuario.bloqueoHasta = new Date(Date.now() + 15 * 60 * 1000);
        await manager.save(usuario);
        return null;
      }
      if (nuevaContrasena !== undefined) {
        if (!usuario.cambiarContrasena)
          throw new BadRequestException(
            'El cambio inicial ya se completó. Inicia sesión con tu contraseña actual.',
          );
        if (contrasena === nuevaContrasena)
          throw new BadRequestException(
            'Elige una contraseña diferente a la temporal.',
          );
        usuario.contrasenaHash = await hashContrasena(nuevaContrasena);
        usuario.cambiarContrasena = false;
        usuario.contrasenaTemporalExpiraEn = null;
        usuario.correoVerificado = true;
        usuario.version += 1;
        await manager.update(
          SesionAcceso,
          { usuarioId: usuario.id, revocadaEn: IsNull() },
          { revocadaEn: new Date() },
        );
      }
      usuario.intentosAcceso = 0;
      usuario.bloqueoHasta = null;
      return manager.save(usuario);
    });
    if (!resultado)
      throw new UnauthorizedException(
        'Correo o contraseña incorrectos, cuenta desactivada o acceso bloqueado. Si olvidaste tu contraseña, contacta a un administrador.',
      );
    return resultado;
  }
}
