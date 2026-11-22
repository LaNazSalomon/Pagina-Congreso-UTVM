// --plan (predeterminado): simula y revierte. --apply: conserva los cambios.
const path = require('node:path');
const fs = require('node:fs/promises');
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

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--plan', '--apply'].includes(arg)))
    throw new Error('Usa --plan o --apply');
  const apply = args.includes('--apply');
  await client.connect();
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('migrate-registration-days'))",
    );
    for (const table of ['externos', 'participante_nsu']) {
      await client.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS congreso_id uuid REFERENCES congreso(id) ON DELETE RESTRICT`,
      );
      await client.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "diaEventoIds" uuid[]`,
      );
    }
    await client.query(
      'ALTER TABLE participante_nsu ALTER COLUMN dias TYPE text',
    );
    const congresses = (
      await client.query(
        `SELECT id, nombre, fecha_inicio, fecha_fin FROM congreso WHERE deleted_at IS NULL ORDER BY fecha_inicio`,
      )
    ).rows.map((congreso) => ({
      ...congreso,
      inicio: congreso.fecha_inicio.toISOString().slice(0, 10),
      fin: congreso.fecha_fin.toISOString().slice(0, 10),
    }));
    const changes = [];
    const unresolved = [];
    for (const [table, type, createdColumn, amountColumn] of [
      ['externos', 'EXTERNO', 'createdAt', 'total'],
      ['participante_nsu', 'NSU', 'created_at', 'monto_individual'],
    ]) {
      const records = (
        await client.query(
          `SELECT id, dias, congreso_id, "diaEventoIds", "${createdColumn}"::date::text AS creado, "${amountColumn}" AS monto FROM ${table} WHERE deleted_at IS NULL ORDER BY "${createdColumn}" FOR UPDATE`,
        )
      ).rows;
      for (const record of records) {
        if (record.congreso_id && record.diaEventoIds?.length) continue;
        const previousAccess = (
          await client.query(
            `SELECT DISTINCT p.congreso_id FROM participante_acceso p INNER JOIN qr_acceso q ON q.participante_id = p.id WHERE p.tipo = $1 AND p.referencia_id = $2`,
            [type, record.id],
          )
        ).rows;
        const relevant = record.congreso_id
          ? congresses.filter((c) => c.id === record.congreso_id)
          : previousAccess.length
            ? congresses.filter((c) =>
                previousAccess.some((p) => p.congreso_id === c.id),
              )
            : congresses.filter(
                (c) => c.inicio <= record.creado && c.fin >= record.creado,
              );
        if (relevant.length !== 1) {
          unresolved.push({
            table,
            id: record.id,
            motivo: 'No se puede determinar un único congreso original.',
          });
          continue;
        }
        const congress = relevant[0];
        const duration =
          (Date.parse(congress.fin) - Date.parse(congress.inicio)) / 86400000 +
          1;
        if (duration < 1 || duration > 366)
          throw new Error('Periodo de congreso inválido para la conversión');
        await client.query(
          `INSERT INTO dia_evento (congreso_id, fecha_evento, etiqueta)
          SELECT $1, d::date, 'Dia ' || row_number() OVER (ORDER BY d)
          FROM generate_series($2::date, $3::date, interval '1 day') d
          ON CONFLICT (congreso_id, fecha_evento) DO NOTHING`,
          [congress.id, congress.inicio, congress.fin],
        );
        const days = (
          await client.query(
            'SELECT id, fecha_evento::text AS fecha FROM dia_evento WHERE congreso_id = $1 AND fecha_evento BETWEEN $2::date AND $3::date ORDER BY fecha_evento',
            [congress.id, congress.inicio, congress.fin],
          )
        ).rows;
        const oldDays = Array.isArray(record.dias)
          ? record.dias
          : String(record.dias || '').split(',');
        const entries = [
          ...new Set(oldDays.map((value) => value.trim()).filter(Boolean)),
        ];
        const selected = entries.map((value) => {
          const ordinal = value.match(/^d[ií]a[\s_]*(\d+)$/i);
          return ordinal
            ? days[Number(ordinal[1]) - 1]
            : days.find((day) => day.fecha === value || day.id === value);
        });
        if (!selected.length || selected.some((day) => !day)) {
          unresolved.push({
            table,
            id: record.id,
            motivo:
              'Hay días antiguos que no se pueden convertir sin cambiar la selección.',
          });
          continue;
        }
        const dates = selected.map((day) => day.fecha);
        const ids = selected.map((day) => day.id);
        const nextDays = dates.join(',');
        await client.query(
          `UPDATE ${table} SET congreso_id = $1, "diaEventoIds" = $2, dias = $3 WHERE id = $4`,
          [congress.id, ids, nextDays, record.id],
        );
        const after = (
          await client.query(
            `SELECT "${amountColumn}" AS monto FROM ${table} WHERE id = $1`,
            [record.id],
          )
        ).rows[0];
        if (after.monto !== record.monto)
          throw new Error(
            'La conversión intentó modificar el importe original',
          );
        changes.push({
          table,
          id: record.id,
          antes: {
            dias: record.dias,
            congresoId: record.congreso_id,
            diaEventoIds: record.diaEventoIds,
            monto: record.monto,
          },
          despues: {
            congresoId: congress.id,
            diaEventoIds: ids,
            fechas: dates,
          },
        });
      }
    }
    if (apply && unresolved.length)
      throw new Error(
        `Hay ${unresolved.length} registros ambiguos. Revisa primero --plan; no se aplicó ningún cambio.`,
      );
    const report = {
      fecha: new Date().toISOString(),
      aplicado: apply,
      convertidos: changes.length,
      pendientes: unresolved,
      cambios: changes,
    };
    // Conservar el informe antes del COMMIT para poder recuperar la selección original.
    if (apply)
      await fs.writeFile(
        path.join(__dirname, `registration-days-report-${Date.now()}.json`),
        JSON.stringify(report, null, 2) + '\n',
      );
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(
      JSON.stringify(
        {
          aplicado: apply,
          convertidos: changes.length,
          pendientes: unresolved,
          detalle: changes.map((c) => ({
            tabla: c.table,
            id: c.id,
            fechas: c.despues.fechas,
          })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
main()
  .catch((error) => {
    console.error(error.code || error.name, error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
