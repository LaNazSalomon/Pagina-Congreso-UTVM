// Crea únicamente la primera cuenta administradora. No envía correos.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile(path.join(__dirname, '../.env'));

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--plan') options.plan = true;
    else if (['--nombre', '--correo'].includes(key) && args[i + 1])
      options[key.slice(2)] = args[++i];
    else
      throw new Error(
        'Usa --nombre "Nombre completo" --correo correo@dominio.com [--plan]',
      );
  }
  const nombre = String(
    options.nombre || process.env.BOOTSTRAP_ADMIN_NOMBRE || '',
  ).trim();
  const correo = String(
    options.correo || process.env.BOOTSTRAP_ADMIN_CORREO || '',
  )
    .trim()
    .toLowerCase();
  if (
    nombre.length < 2 ||
    nombre.length > 150 ||
    correo.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
  )
    throw new Error(
      'Indica un nombre y un correo válidos para la primera cuenta.',
    );
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('gestion-personal'))",
    );
    const existing = (
      await client.query(
        "SELECT id FROM usuario_personal WHERE activo = TRUE AND rol = 'ADMINISTRADOR' LIMIT 1",
      )
    ).rows[0];
    if (existing) {
      await client.query('ROLLBACK');
      console.log(
        JSON.stringify({
          creado: false,
          id: existing.id,
          mensaje:
            'Ya existe un administrador activo. Usa Usuarios y roles para gestionar las cuentas.',
        }),
      );
      return;
    }
    const id = randomUUID();
    await client.query(
      'INSERT INTO usuario_personal (id, nombre, correo, rol, activo, "correoVerificado", version) VALUES ($1, $2, $3, $4, TRUE, FALSE, 1)',
      [id, nombre, correo, 'ADMINISTRADOR'],
    );
    await client.query(options.plan ? 'ROLLBACK' : 'COMMIT');
    console.log(
      JSON.stringify({
        creado: !options.plan,
        simulacion: !!options.plan,
        nombre,
        correo,
        mensaje:
          'Cuenta preparada. Ejecuta configurar-contrasena-admin.cjs con --correo para enviar su enlace inicial. No se enviaron correos.',
      }),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '42P01')
      throw new Error(
        'Primero compila e inicia el backend para crear las tablas del personal.',
      );
    if (error.code === '23505')
      throw new Error(
        'Ese correo ya tiene una cuenta de personal. Revisa su estado antes de crear el administrador inicial.',
      );
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
