/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-require-imports */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource, IsNull } from 'typeorm';
import { AppModule } from '../app.module';
import { hashContrasena } from './contrasena';
import { CorreoService } from '../correo/correo.service';
import { Congreso } from '../congreso/entities/congreso.entity';
import { DiaEvento } from '../dia-evento/entities/dia-evento.entity';
import { Externo } from '../externos/entities/externo.entity';
import { ParticipanteAcceso } from '../participante-acceso/entities/participante-acceso.entity';
import { ParticipanteTipo } from '../participante-acceso/participante-tipo.enum';
import { CodigoQr } from '../codigo-qr/entities/codigo-qr.entity';
import { QrAcceso } from '../qr-acceso/entities/qr-acceso.entity';
import { DiaParticipante } from '../qr-acceso/entities/dia-participante.entity';
import {
  EnlaceContrasenaPersonal,
  RolPersonal,
  SesionAcceso,
  UsuarioPersonal,
} from './entities/personal.entity';

interface ClientSession {
  cookie: string;
  csrf: string;
}
interface StaffLogin {
  usuario: { id: string; rol: RolPersonal };
  csrfTokenPersonal: string;
}
// Usa un esquema temporal propio. No modifica los registros de la aplicación.
const integration =
  process.env.RUN_PERSONAL_INTEGRATION === '1' ? describe : describe.skip;

integration('Personal y permisos: API real con PostgreSQL aislado', () => {
  jest.setTimeout(60000);
  const schema = `roles_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  const enviados = new Map<string, string>();
  const CLAVE = 'Clave de prueba permanente 2026!';
  let fixtureHash: string;
  let app: INestApplication;
  let db: DataSource;
  let admin: UsuarioPersonal;
  let adminSession: ClientSession;
  const correo = {
    enviarEnlaceContrasenaPersonal: jest.fn((email: string, codigo: string) => {
      enviados.set(email, codigo);
      return Promise.resolve();
    }),
    enviarCodigoLogin: jest.fn((email: string, codigo: string) => {
      enviados.set(email, codigo);
      return Promise.resolve();
    }),
    enviarQrAcceso: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.RECONOCIMIENTOS_JOB_ENABLED = 'false';
    fixtureHash = await hashContrasena(CLAVE);
    const root = join(__dirname, '..');
    const entities = readdirSync(root, { recursive: true })
      .filter((file) => String(file).endsWith('.entity.ts'))
      .flatMap((file) =>
        Object.values(
          require(join(root, String(file))) as Record<string, unknown>,
        ),
      )
      .filter(
        (value): value is new () => object => typeof value === 'function',
      );
    db = new DataSource({
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      schema,
      entities,
      uuidExtension: 'pgcrypto',
      installExtensions: false,
      synchronize: false,
      extra: {
        options: `-c search_path=${schema} -c timezone=America/Mexico_City`,
        connectionTimeoutMillis: 10000,
      },
    });
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(db)
      .overrideProvider(CorreoService)
      .useValue(correo)
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 1000,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  beforeEach(async () => {
    enviados.clear();
    jest.clearAllMocks();
    const tables = db.entityMetadatas
      .map((metadata) => `"${schema}"."${metadata.tableName}"`)
      .join(', ');
    await db.query(`TRUNCATE TABLE ${tables} CASCADE`);
    admin = await usuario(RolPersonal.ADMINISTRADOR, 'admin@example.com');
    adminSession = await iniciar(admin.correo);
  });
  afterAll(async () => {
    if (db?.isInitialized)
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    if (app) await app.close();
    if (db?.isInitialized) await db.destroy();
  });

  async function usuario(rol: RolPersonal, email: string, activo = true) {
    return db.getRepository(UsuarioPersonal).save({
      nombre: 'Personal de prueba',
      correo: email,
      rol,
      activo,
      correoVerificado: true,
      contrasenaConfigurada: true,
      contrasenaHash: fixtureHash,
      cambiarContrasena: false,
      version: 1,
    });
  }
  function cookie(response: request.Response) {
    return (response.headers['set-cookie'] as unknown as string[])[0].split(
      ';',
    )[0];
  }
  async function iniciar(
    email: string,
    contrasena = CLAVE,
  ): Promise<ClientSession> {
    const response = await request(app.getHttpServer())
      .post('/api/personal/acceso/entrar')
      .send({ correo: email, contrasena })
      .expect(201);
    const body = response.body as StaffLogin;
    return { cookie: cookie(response), csrf: body.csrfTokenPersonal };
  }
  async function activar(email: string, token: string): Promise<ClientSession> {
    const response = await request(app.getHttpServer())
      .post('/api/personal/acceso/restablecer-contrasena')
      .send({ token, nuevaContrasena: CLAVE })
      .expect(201);
    expect(response.headers['set-cookie']).toBeUndefined();
    return iniciar(email);
  }
  function as(
    client: ClientSession,
    method: 'get' | 'post' | 'patch',
    path: string,
  ) {
    return request(app.getHttpServer())
      [method](`/api${path}`)
      .set('Cookie', client.cookie)
      .set('x-csrf-token', client.csrf);
  }
  async function accesoQr() {
    const rows: { fecha: string }[] = await db.query(
      "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date::text AS fecha",
    );
    const hoy = rows[0].fecha;
    const congreso = await db.getRepository(Congreso).save({
      nombre: 'Congreso de prueba',
      eslogan: 'Prueba',
      ubicacion: 'UTVM',
      fecha_inicio: new Date(`${hoy}T00:00:00.000Z`),
      fecha_fin: new Date(`${hoy}T23:59:59.999Z`),
    });
    const dia = await db
      .getRepository(DiaEvento)
      .save({ congreso, fecha_evento: hoy, etiqueta: 'Dia 1' });
    const externo = await db.getRepository(Externo).save({
      nombre: 'Ana',
      apellidoPaterno: 'Prueba',
      correo: 'participante@example.com',
      telefono: '5512345678',
      dias: [hoy],
      diaEventoIds: [dia.id],
      congresoId: congreso.id,
      total: 250,
      correoVerificado: true,
      status: 'validado',
    });
    const participante = await db.getRepository(ParticipanteAcceso).save({
      tipo: ParticipanteTipo.EXTERNO,
      referencia_id: externo.id,
      congreso,
    });
    const token = randomBytes(32).toString('base64url');
    const codigo = await db.getRepository(CodigoQr).save({
      token_hash: createHash('sha256').update(token).digest('hex'),
      tipo: 'acceso',
      activo: true,
    });
    await db.getRepository(QrAcceso).save({ codigo_qr: codigo, participante });
    await db.getRepository(DiaParticipante).save({
      participante_id: participante.id,
      dia_evento_id: dia.id,
      acceso_utilizado: false,
      fecha_ingreso: null,
    });
    return { token, externo, dia, participante };
  }

  async function sinPersonal() {
    await db.query(`TRUNCATE TABLE "${schema}"."usuario_personal" CASCADE`);
    enviados.clear();
    correo.enviarEnlaceContrasenaPersonal.mockClear();
  }

  it('registra solo al primer administrador y envía un enlace para elegir contraseña', async () => {
    await sinPersonal();
    const estado = await request(app.getHttpServer())
      .get('/api/personal/configuracion-inicial')
      .expect(200);
    expect(estado.body).toEqual({ requiereAdministradorInicial: true });
    expect(estado.headers['cache-control']).toBe('no-store');
    const response = await request(app.getHttpServer())
      .post('/api/personal/configuracion-inicial')
      .send({
        nombre: ' Primera Administradora ',
        correo: ' INICIAL@EXAMPLE.COM ',
      })
      .expect(201);
    expect(response.headers['set-cookie']).toBeUndefined();
    const [cuenta] = await db.getRepository(UsuarioPersonal).find();
    expect(cuenta).toMatchObject({
      nombre: 'Primera Administradora',
      correo: 'inicial@example.com',
      rol: RolPersonal.ADMINISTRADOR,
      correoVerificado: false,
      contrasenaConfigurada: false,
      cambiarContrasena: false,
    });
    const token = enviados.get(cuenta.correo)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const guardado = await db
      .getRepository(EnlaceContrasenaPersonal)
      .createQueryBuilder('e')
      .addSelect('e.tokenHash')
      .getOneOrFail();
    expect(guardado.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(JSON.stringify(response.body)).not.toContain(token);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/entrar')
      .send({ correo: cuenta.correo, contrasena: token })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/personal/usuarios')
      .expect(401);
    for (let i = 0; i < 2; i++)
      await request(app.getHttpServer())
        .post('/api/personal/acceso/comprobar-enlace')
        .send({ token })
        .expect(201, { valido: true });
    const sesion = await activar(cuenta.correo, token);
    const lista = await as(sesion, 'get', '/personal/usuarios').expect(200);
    expect(JSON.stringify(lista.body)).not.toContain('contrasenaHash');
    expect(JSON.stringify(lista.body)).not.toContain(token);
    expect(
      (
        await db
          .getRepository(UsuarioPersonal)
          .findOneByOrFail({ id: cuenta.id })
      ).correoVerificado,
    ).toBe(true);
    await request(app.getHttpServer())
      .get('/api/personal/configuracion-inicial')
      .expect(200, { requiereAdministradorInicial: false });
  });

  it('serializa las altas iniciales simultáneas y no reabre el alta si la cuenta se desactiva', async () => {
    await sinPersonal();
    const responses = await Promise.all(
      ['uno', 'dos'].map((nombre) =>
        request(app.getHttpServer())
          .post('/api/personal/configuracion-inicial')
          .send({ nombre, correo: `${nombre}@example.com` }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.getRepository(UsuarioPersonal).count()).toBe(1);
    expect(correo.enviarEnlaceContrasenaPersonal).toHaveBeenCalledTimes(1);
    const [cuenta] = await db.getRepository(UsuarioPersonal).find();
    await db
      .getRepository(UsuarioPersonal)
      .update(cuenta.id, { activo: false });
    await request(app.getHttpServer())
      .get('/api/personal/configuracion-inicial')
      .expect(200, { requiereAdministradorInicial: false });
    await request(app.getHttpServer())
      .post('/api/personal/configuracion-inicial')
      .send({ nombre: 'Otra', correo: 'otra@example.com' })
      .expect(409);
  });

  it('rechaza elegir rol, contraseña o confirmación del correo en el alta pública', async () => {
    await sinPersonal();
    for (const extra of [
      { rol: RolPersonal.VALIDADOR },
      { correoVerificado: true },
      { activo: true },
      { contrasena: CLAVE },
    ]) {
      await request(app.getHttpServer())
        .post('/api/personal/configuracion-inicial')
        .send({ nombre: 'Prueba', correo: 'prueba@example.com', ...extra })
        .expect(400);
    }
    expect(await db.getRepository(UsuarioPersonal).count()).toBe(0);
    expect(correo.enviarEnlaceContrasenaPersonal).not.toHaveBeenCalled();
  });

  it('revierte el alta inicial si SMTP falla para permitir un reintento completo', async () => {
    await sinPersonal();
    correo.enviarEnlaceContrasenaPersonal.mockRejectedValueOnce(
      new Error('SMTP simulado'),
    );
    await request(app.getHttpServer())
      .post('/api/personal/configuracion-inicial')
      .send({ nombre: 'Primera', correo: 'reintento@example.com' })
      .expect(503);
    expect(await db.getRepository(UsuarioPersonal).count()).toBe(0);
    await request(app.getHttpServer())
      .post('/api/personal/configuracion-inicial')
      .send({ nombre: 'Primera', correo: 'reintento@example.com' })
      .expect(201);
    expect(await db.getRepository(UsuarioPersonal).count()).toBe(1);
  });

  it('mantiene público el contenido y los registros; deniega la administración sin sesión', async () => {
    await request(app.getHttpServer()).get('/api/congreso').expect(200);
    await request(app.getHttpServer())
      .get('/api/congresos/opciones-registro')
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/ems/multiple')
      .send([])
      .expect((response) => expect([200, 201, 400]).toContain(response.status));
    for (const path of [
      '/externos',
      '/ems',
      '/utvm',
      '/registro-nsu',
      '/hackatones',
      '/personal/usuarios',
      '/reconocimientos',
    ])
      await request(app.getHttpServer()).get(`/api${path}`).expect(401);
    await request(app.getHttpServer())
      .post('/api/congreso')
      .send({})
      .expect(401);
  });

  it('guarda solo hashes y usa cookie HttpOnly para las sesiones', async () => {
    const row = await db
      .getRepository(UsuarioPersonal)
      .findOneByOrFail({ id: admin.id });
    expect(row.correoVerificado).toBe(true);
    const sessions = await db
      .getRepository(SesionAcceso)
      .createQueryBuilder('s')
      .addSelect('s.tokenHash')
      .getMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).not.toBe(adminSession.cookie.split('=')[1]);
    await as(adminSession, 'get', '/personal/usuarios').expect(200);
    const otro = await usuario(RolPersonal.VALIDADOR, 'cookie@example.com');
    const response = await request(app.getHttpServer())
      .post('/api/personal/acceso/entrar')
      .send({ correo: otro.correo, contrasena: CLAVE })
      .expect(201);
    const headers = response.headers['set-cookie'] as unknown as string[];
    expect(headers[0]).toContain('HttpOnly');
    expect(headers[0]).toContain('SameSite=Lax');
    expect(headers[0]).toContain('Path=/api');
    expect(JSON.stringify(response.body)).not.toContain('tokenHash');
  });

  it.each([
    [
      'ems',
      {
        nombres: 'Prueba',
        apellidoPaterno: 'Registro',
        correo: 'ems@example.com',
        telefono: '5512345678',
        institucion: 'UTVM',
        carrera: 'TI',
      },
    ],
    [
      'utvm',
      {
        nombres: 'Prueba',
        apellidoPaterno: 'Registro',
        correo: 'utvm@example.com',
        telefono: '5512345678',
        cuatrimestre: 1,
        grupo: 'A',
      },
    ],
  ])(
    'conserva el registro público %s e impide sobrescribir por ID mediante un lote',
    async (tipo, payload) => {
      const created = await request(app.getHttpServer())
        .post(`/api/${tipo}/multiple`)
        .send([payload])
        .expect(201);
      const rows = created.body as { id: number; correo: string }[];
      await request(app.getHttpServer())
        .post(`/api/${tipo}/multiple`)
        .send([{ ...payload, id: rows[0].id, correo: 'intruso@example.com' }])
        .expect(400);
      const listado = await as(adminSession, 'get', `/${tipo}`).expect(200);
      const actuales = listado.body as { id: number; correo: string }[];
      expect(actuales).toHaveLength(1);
      expect(actuales[0].correo).toBe(payload.correo);
    },
  );

  it('deshabilita ambos endpoints antiguos de códigos y no envía correo durante el login', async () => {
    for (const ruta of ['codigo', 'verificar'])
      await request(app.getHttpServer())
        .post(`/api/personal/acceso/${ruta}`)
        .send({ correo: admin.correo, codigo: '123456' })
        .expect(410);
    await iniciar(admin.correo);
    expect(correo.enviarEnlaceContrasenaPersonal).not.toHaveBeenCalled();
    for (const email of [
      'noexiste@example.com',
      (await usuario(RolPersonal.VALIDADOR, 'inactivo@example.com', false))
        .correo,
    ]) {
      await request(app.getHttpServer())
        .post('/api/personal/acceso/entrar')
        .send({ correo: email, contrasena: CLAVE })
        .expect(401);
    }
  });

  it('persiste los intentos fallidos y bloquea durante quince minutos después de diez fallos', async () => {
    const persona = await usuario(
      RolPersonal.VALIDADOR,
      'intentos@example.com',
    );
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/api/personal/acceso/entrar')
        .send({ correo: persona.correo, contrasena: 'incorrecta' })
        .expect(401);
    const bloqueada = await db
      .getRepository(UsuarioPersonal)
      .findOneByOrFail({ id: persona.id });
    expect(bloqueada.intentosAcceso).toBe(10);
    expect(bloqueada.bloqueoHasta!.getTime()).toBeGreaterThan(Date.now());
    await request(app.getHttpServer())
      .post('/api/personal/acceso/entrar')
      .send({ correo: persona.correo, contrasena: CLAVE })
      .expect(401);
    await db
      .getRepository(UsuarioPersonal)
      .update(persona.id, { bloqueoHasta: new Date(Date.now() - 1000) });
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/api/personal/acceso/entrar')
        .send({ correo: persona.correo, contrasena: 'incorrecta' })
        .expect(401);
    expect(
      (
        await db
          .getRepository(UsuarioPersonal)
          .findOneByOrFail({ id: persona.id })
      ).intentosAcceso,
    ).toBe(10);
    expect(
      (
        await db
          .getRepository(UsuarioPersonal)
          .findOneByOrFail({ id: persona.id })
      ).bloqueoHasta!.getTime(),
    ).toBeGreaterThan(Date.now());
    await db
      .getRepository(UsuarioPersonal)
      .update(persona.id, { bloqueoHasta: new Date(Date.now() - 1000) });
    await iniciar(persona.correo);
  });

  it('solo un administrador envía el enlace; sustituirlo invalida el anterior y guardar revoca accesos', async () => {
    const persona = await usuario(RolPersonal.VALIDADOR, 'reset@example.com');
    const anterior = await iniciar(persona.correo);
    const ruta = `/personal/usuarios/${persona.id}/restablecer-contrasena`;
    await request(app.getHttpServer()).post(`/api${ruta}`).expect(401);
    await as(anterior, 'post', ruta).expect(403);
    await as(adminSession, 'post', ruta).expect(201);
    await as(anterior, 'get', '/personal/sesion').expect(200);
    await iniciar(persona.correo);
    const token = enviados.get(persona.correo)!;
    await db
      .getRepository(EnlaceContrasenaPersonal)
      .update(persona.id, { expiraEn: new Date(Date.now() - 1000) });
    await request(app.getHttpServer())
      .post('/api/personal/acceso/comprobar-enlace')
      .send({ token })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/restablecer-contrasena')
      .send({ token, nuevaContrasena: CLAVE })
      .expect(401);
    await as(adminSession, 'post', ruta).expect(201);
    const nuevoToken = enviados.get(persona.correo)!;
    expect(nuevoToken).not.toBe(token);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/comprobar-enlace')
      .send({ token })
      .expect(401);
    const nuevaContrasena = 'Otra clave segura 2026!';
    const response = await request(app.getHttpServer())
      .post('/api/personal/acceso/restablecer-contrasena')
      .send({ token: nuevoToken, nuevaContrasena })
      .expect(201);
    expect(response.headers['set-cookie']).toBeUndefined();
    await as(anterior, 'get', '/personal/sesion').expect(401);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/entrar')
      .send({ correo: persona.correo, contrasena: CLAVE })
      .expect(401);
    await iniciar(persona.correo, nuevaContrasena);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/comprobar-enlace')
      .send({ token: nuevoToken })
      .expect(401);
  });

  it('conserva contraseña y sesiones anteriores si el restablecimiento no se puede enviar', async () => {
    const persona = await usuario(RolPersonal.VALIDADOR, 'smtp@example.com');
    const anterior = await iniciar(persona.correo);
    correo.enviarEnlaceContrasenaPersonal.mockRejectedValueOnce(
      new Error('SMTP simulado'),
    );
    await as(
      adminSession,
      'post',
      `/personal/usuarios/${persona.id}/restablecer-contrasena`,
    ).expect(503);
    await as(anterior, 'get', '/personal/sesion').expect(200);
    await iniciar(persona.correo);
  });

  it('permite migrar una cuenta anterior desde su sesión, una sola vez', async () => {
    await db
      .getRepository(UsuarioPersonal)
      .update(admin.id, { contrasenaHash: null, contrasenaConfigurada: false });
    await request(app.getHttpServer())
      .post('/api/personal/contrasena-inicial')
      .expect(401);
    await as(adminSession, 'post', '/personal/contrasena-inicial').expect(201);
    await as(adminSession, 'get', '/personal/sesion').expect(200);
    const sesion = await activar(admin.correo, enviados.get(admin.correo)!);
    await as(sesion, 'post', '/personal/contrasena-inicial').expect(409);
  });

  it.each([
    ['Aa1!aaa', '8 caracteres'],
    ['aa1!aaaa', 'mayúscula'],
    ['AA1!AAAA', 'minúscula'],
    ['Aa!!aaaa', 'número'],
    ['Aa11aaaa', 'signo'],
    ['Aa11 aaa', 'signo'],
    [`Aa1!${'a'.repeat(125)}`, '128 caracteres'],
  ])(
    'rechaza la contraseña inválida %s aunque se envíe directamente a la API',
    async (nuevaContrasena, requisito) => {
      const response = await request(app.getHttpServer())
        .post('/api/personal/acceso/restablecer-contrasena')
        .send({ token: 'T'.repeat(43), nuevaContrasena })
        .expect(400);
      expect((response.body as { message: string[] }).message).toEqual(
        expect.arrayContaining([expect.stringContaining(requisito)]),
      );
      await iniciar(admin.correo);
    },
  );

  it('acepta una contraseña de ocho caracteres con todos los requisitos y permite entrar después', async () => {
    const persona = await usuario(RolPersonal.VALIDADOR, 'ocho@example.com');
    await as(
      adminSession,
      'post',
      `/personal/usuarios/${persona.id}/restablecer-contrasena`,
    ).expect(201);
    const token = enviados.get(persona.correo)!;
    const nuevaContrasena = 'Áb1!cdef';
    await request(app.getHttpServer())
      .post('/api/personal/acceso/restablecer-contrasena')
      .send({ token, nuevaContrasena })
      .expect(201);
    await iniciar(persona.correo, nuevaContrasena);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/entrar')
      .send({ correo: persona.correo, contrasena: token })
      .expect(401);
  });

  it('conserva el enlace ante una contraseña inválida y solo permite un uso concurrente', async () => {
    const persona = await usuario(RolPersonal.VALIDADOR, 'token@example.com');
    await as(
      adminSession,
      'post',
      `/personal/usuarios/${persona.id}/restablecer-contrasena`,
    ).expect(201);
    const token = enviados.get(persona.correo)!;
    await request(app.getHttpServer())
      .post('/api/personal/acceso/restablecer-contrasena')
      .send({ token, nuevaContrasena: 'corta' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/comprobar-enlace')
      .send({ token })
      .expect(201);
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/personal/acceso/restablecer-contrasena')
          .send({ token, nuevaContrasena: CLAVE }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 401]);
  });

  it('rechaza enlaces manipulados, de cuentas desactivadas o cuyo rol cambió', async () => {
    const persona = await usuario(RolPersonal.VALIDADOR, 'version@example.com');
    const ruta = `/personal/usuarios/${persona.id}/restablecer-contrasena`;
    await as(adminSession, 'post', ruta).expect(201);
    const token = enviados.get(persona.correo)!;
    await request(app.getHttpServer())
      .post('/api/personal/acceso/comprobar-enlace')
      .send({ token: 'X'.repeat(43) })
      .expect(401);
    await as(adminSession, 'patch', `/personal/usuarios/${persona.id}`)
      .send({ rol: 'ADMINISTRADOR' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/restablecer-contrasena')
      .send({ token, nuevaContrasena: CLAVE })
      .expect(401);
    await as(adminSession, 'post', ruta).expect(201);
    const tokenNuevo = enviados.get(persona.correo)!;
    await as(adminSession, 'patch', `/personal/usuarios/${persona.id}`)
      .send({ activo: false })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/restablecer-contrasena')
      .send({ token: tokenNuevo, nuevaContrasena: CLAVE })
      .expect(401);
  });

  it('conserva el enlace anterior si falla el reenvío', async () => {
    const persona = await usuario(RolPersonal.VALIDADOR, 'reenvio@example.com');
    const ruta = `/personal/usuarios/${persona.id}/restablecer-contrasena`;
    await as(adminSession, 'post', ruta).expect(201);
    const token = enviados.get(persona.correo)!;
    correo.enviarEnlaceContrasenaPersonal.mockRejectedValueOnce(
      new Error('SMTP simulado'),
    );
    await as(adminSession, 'post', ruta).expect(503);
    await request(app.getHttpServer())
      .post('/api/personal/acceso/comprobar-enlace')
      .send({ token })
      .expect(201);
    await activar(persona.correo, token);
  });

  it('mantiene utilizables las contraseñas temporales emitidas antes de esta actualización', async () => {
    const persona = await usuario(
      RolPersonal.VALIDADOR,
      'compatibilidad@example.com',
    );
    await db.getRepository(UsuarioPersonal).update(persona.id, {
      cambiarContrasena: true,
      contrasenaTemporalExpiraEn: new Date(Date.now() + 60000),
    });
    await request(app.getHttpServer())
      .post('/api/personal/acceso/entrar')
      .send({ correo: persona.correo, contrasena: CLAVE })
      .expect(201, { requiereCambioContrasena: true });
    await request(app.getHttpServer())
      .post('/api/personal/acceso/cambiar-contrasena')
      .send({
        correo: persona.correo,
        contrasena: CLAVE,
        nuevaContrasena: 'Otra contraseña válida 2026!',
      })
      .expect(201);
  });

  it('separa Administrador y Validador incluso al llamar directamente a la API', async () => {
    const validador = await usuario(
      RolPersonal.VALIDADOR,
      'validador@example.com',
    );
    const sesion = await iniciar(validador.correo);
    const { token } = await accesoQr();
    await as(sesion, 'get', '/externos').expect(403);
    await as(sesion, 'post', '/personal/usuarios')
      .send({
        nombre: 'Escalamiento',
        correo: 'otro@example.com',
        rol: 'ADMINISTRADOR',
      })
      .expect(403);
    await as(adminSession, 'get', `/acceso/qr/${token}`).expect(403);
    await as(sesion, 'get', `/acceso/qr/${token}`).expect(200);
  });

  it('exige CSRF y rechaza orígenes ajenos sin consumir la entrada', async () => {
    const validador = await usuario(RolPersonal.VALIDADOR, 'csrf@example.com');
    const sesion = await iniciar(validador.correo);
    const { token, participante, dia } = await accesoQr();
    await request(app.getHttpServer())
      .post(`/api/acceso/qr/${token}/confirmar`)
      .set('Cookie', sesion.cookie)
      .expect(401);
    await as(sesion, 'post', `/acceso/qr/${token}/confirmar`)
      .set('Origin', 'https://ajeno.example')
      .expect(403);
    await as(sesion, 'post', `/acceso/qr/${token}/confirmar`)
      .set('x-csrf-token', 'é'.repeat(64))
      .expect(401);
    expect(
      (
        await db.getRepository(DiaParticipante).findOneByOrFail({
          participante_id: participante.id,
          dia_evento_id: dia.id,
        })
      ).acceso_utilizado,
    ).toBe(false);
  });

  it('registra la identidad del validador e impide dos entradas concurrentes', async () => {
    const validador = await usuario(
      RolPersonal.VALIDADOR,
      'auditoria@example.com',
    );
    const sesion = await iniciar(validador.correo);
    const { token, participante, dia } = await accesoQr();
    const responses = await Promise.all([
      as(sesion, 'post', `/acceso/qr/${token}/confirmar`),
      as(sesion, 'post', `/acceso/qr/${token}/confirmar`),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const entrada = await db.getRepository(DiaParticipante).findOneByOrFail({
      participante_id: participante.id,
      dia_evento_id: dia.id,
    });
    expect(entrada.validador_id).toBe(validador.id);
    expect(entrada.fecha_ingreso).toBeInstanceOf(Date);
    const origen = await db
      .getRepository(ParticipanteAcceso)
      .findOneByOrFail({ id: participante.id });
    await as(
      adminSession,
      'post',
      `/externos/${origen.referencia_id}/qr-acceso/enviar-automatico`,
    ).expect(201);
    const conservada = await db.getRepository(DiaParticipante).findOneByOrFail({
      participante_id: participante.id,
      dia_evento_id: dia.id,
    });
    expect(conservada.acceso_utilizado).toBe(true);
    expect(conservada.validador_id).toBe(validador.id);
    expect(conservada.fecha_ingreso).toEqual(entrada.fecha_ingreso);
  });

  it('revoca las sesiones al cambiar rol o desactivar y conserva al último administrador', async () => {
    const pendiente = await usuario(
      RolPersonal.ADMINISTRADOR,
      'pendiente@example.com',
    );
    await db
      .getRepository(UsuarioPersonal)
      .update(pendiente.id, { correoVerificado: false });
    await as(adminSession, 'patch', `/personal/usuarios/${admin.id}`)
      .send({ activo: false })
      .expect(400);
    await as(adminSession, 'patch', `/personal/usuarios/${admin.id}`)
      .send({ rol: 'VALIDADOR' })
      .expect(400);
    const validador = await usuario(
      RolPersonal.VALIDADOR,
      'cambio@example.com',
    );
    const anterior = await iniciar(validador.correo);
    await as(adminSession, 'patch', `/personal/usuarios/${validador.id}`)
      .send({ rol: 'ADMINISTRADOR' })
      .expect(200);
    await as(anterior, 'get', '/personal/sesion').expect(401);
    const nueva = await iniciar(validador.correo);
    await as(nueva, 'get', '/personal/usuarios').expect(200);
    await as(adminSession, 'patch', `/personal/usuarios/${validador.id}`)
      .send({ activo: false })
      .expect(200);
    await as(nueva, 'get', '/personal/sesion').expect(401);
  });

  it('conserva la cuenta si falla la invitación y permite reenviarla', async () => {
    correo.enviarEnlaceContrasenaPersonal.mockRejectedValueOnce(
      new Error('SMTP no disponible'),
    );
    const response = await as(adminSession, 'post', '/personal/usuarios')
      .send({
        nombre: 'Personal nuevo',
        correo: 'nuevo@example.com',
        rol: 'VALIDADOR',
      })
      .expect(201);
    const body = response.body as {
      invitacionEnviada: boolean;
      usuario: { id: string };
    };
    expect(body.invitacionEnviada).toBe(false);
    await as(
      adminSession,
      'post',
      `/personal/usuarios/${body.usuario.id}/restablecer-contrasena`,
    ).expect(201);
    await as(adminSession, 'post', '/personal/usuarios')
      .send({
        nombre: 'Duplicado',
        correo: 'NUEVO@example.com',
        rol: 'VALIDADOR',
      })
      .expect(409);
    expect(
      await db
        .getRepository(UsuarioPersonal)
        .countBy({ correo: 'nuevo@example.com' }),
    ).toBe(1);
  });

  it('el participante conserva su propio reenvío QR y no puede administrar ni validar entradas', async () => {
    const { externo, token } = await accesoQr();
    await request(app.getHttpServer())
      .post('/api/login')
      .send({ correo: externo.correo })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/api/login/verificar-codigo')
      .send({ correo: externo.correo, codigo: enviados.get(externo.correo) })
      .expect(201);
    const ownCookie = cookie(response);
    const body = response.body as { csrfTokenParticipante: string };
    const own = (path: string) =>
      request(app.getHttpServer())
        .post(`/api${path}`)
        .set('Cookie', ownCookie)
        .set('x-participante-csrf', body.csrfTokenParticipante);
    await request(app.getHttpServer())
      .get('/api/externos')
      .set('Cookie', ownCookie)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/acceso/qr/${token}`)
      .set('Cookie', ownCookie)
      .expect(401);
    await own(`/externos/${admin.id}/qr-acceso/enviar-automatico`).expect(403);
    await own(`/externos/${externo.id}/qr-acceso/enviar-automatico`).expect(
      201,
    );
    expect(correo.enviarQrAcceso).toHaveBeenCalledTimes(1);
    await own('/login/cerrar-sesion').expect(201);
    await own(`/externos/${externo.id}/qr-acceso/enviar-automatico`).expect(
      401,
    );
  });

  it('cerrar sesión y la caducidad invalidan la cookie del personal', async () => {
    await as(adminSession, 'post', '/personal/cerrar-sesion').expect(201);
    await as(adminSession, 'get', '/personal/usuarios').expect(401);
    const fresh = await iniciar(admin.correo);
    await db
      .getRepository(SesionAcceso)
      .update(
        { usuarioId: admin.id, revocadaEn: IsNull() },
        { expiraEn: new Date(Date.now() - 1000) },
      );
    await as(fresh, 'get', '/personal/sesion').expect(401);
  });
});
