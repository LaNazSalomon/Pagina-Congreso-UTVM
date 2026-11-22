// Diagnóstico de solo lectura. No envía correos ni muestra códigos o contraseñas.
const path = require('node:path');
const { Client } = require('pg');
process.loadEnvFile(path.join(__dirname, '../.env'));
const client = new Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  connectionTimeoutMillis: 10000,
});
const ocultarCorreo = (value) => {
  const [name, domain] = value.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};
async function main() {
  await client.connect();
  const accounts = (
    await client.query(`
    SELECT u.id, u.correo, u.rol, u.activo, u."correoVerificado", u."creadoEn",
           u."contrasenaConfigurada", u."cambiarContrasena", u."contrasenaTemporalExpiraEn", u."bloqueoHasta",
           c."enviadoEn", c."expiraEn", c.utilizado, c.intentos,
           e."enviadoEn" AS "enlaceEnviadoEn", e."expiraEn" AS "enlaceExpiraEn", e.utilizado AS "enlaceUtilizado"
    FROM usuario_personal u LEFT JOIN codigo_personal c ON c.usuario_id = u.id
    LEFT JOIN enlace_contrasena_personal e ON e.usuario_id = u.id
    ORDER BY u."creadoEn"
  `)
  ).rows;
  console.log(
    JSON.stringify(
      {
        totalCuentas: accounts.length,
        administradoresActivos: accounts.filter(
          (a) => a.activo && a.rol === 'ADMINISTRADOR',
        ).length,
        cuentas: accounts.map((a) => ({
          id: a.id,
          correo: ocultarCorreo(a.correo),
          rol: a.rol,
          activo: a.activo,
          correoVerificado: a.correoVerificado,
          contrasenaConfigurada: a.contrasenaConfigurada,
          requiereCambioContrasena: a.cambiarContrasena,
          temporalExpiraEn: a.contrasenaTemporalExpiraEn,
          bloqueoHasta: a.bloqueoHasta,
          enlace: a.enlaceEnviadoEn ? { enviadoEn: a.enlaceEnviadoEn, expiraEn: a.enlaceExpiraEn, utilizado: a.enlaceUtilizado } : null,
          creadaEn: a.creadoEn,
          codigo: a.enviadoEn
            ? {
                solicitadoEn: a.enviadoEn,
                expiraEn: a.expiraEn,
                utilizado: a.utilizado,
                intentos: a.intentos,
              }
            : null,
        })),
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error.code || error.name, error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
