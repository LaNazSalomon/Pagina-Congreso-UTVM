// Envía un enlace de recuperación desde el servidor. No imprime tokens ni contraseñas.
const path = require('node:path');
process.loadEnvFile(path.join(__dirname, '../.env'));
process.env.RECONOCIMIENTOS_JOB_ENABLED = 'false';

async function main() {
  const args = process.argv.slice(2);
  const correo = args[0] === '--correo' ? String(args[1] || '').trim().toLowerCase() : '';
  const restablecer = args[2] === '--restablecer';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || args.length !== (restablecer ? 3 : 2))
    throw new Error('Usa --correo correo@dominio.com [--restablecer]');
  const { NestFactory } = require('@nestjs/core');
  const { DataSource } = require('typeorm');
  const { AppModule } = require('../dist/app.module');
  const { PersonalService } = require('../dist/personal/personal.service');
  const { UsuarioPersonal, RolPersonal } = require('../dist/personal/entities/personal.entity');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const cuenta = await app.get(DataSource).getRepository(UsuarioPersonal).findOneBy({ correo, rol: RolPersonal.ADMINISTRADOR, activo: true });
    if (!cuenta) throw new Error('No existe un administrador activo con ese correo.');
    const resultado = await app.get(PersonalService).invitar(cuenta.id, !restablecer);
    console.log(resultado.mensaje);
  } finally { await app.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
