// Corrige la conversión anterior usando su respaldo de selecciones originales.
// --plan simula y revierte; --apply conserva cambios y guarda un respaldo.
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
const date = (value) => value.toISOString().slice(0, 10);
const same = (a, b) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--plan', '--apply'].includes(arg)))
    throw new Error('Usa --plan o --apply');
  const apply = args.includes('--apply');
  const original = JSON.parse(
    await fs.readFile(
      path.join(__dirname, 'registration-days-report-1792371055554.json'),
      'utf8',
    ),
  );
  if (!original.aplicado)
    throw new Error('El respaldo no corresponde a una conversión aplicada');
  await client.connect();
  await client.query('BEGIN');
  const report = {
    fecha: new Date().toISOString(),
    aplicado: apply,
    dias: [],
    registros: [],
    permisos: [],
    pendientes: [],
  };
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('migrate-registration-days'))",
    );
    const congresses = (
      await client.query(
        'SELECT id, fecha_inicio, fecha_fin FROM congreso WHERE deleted_at IS NULL',
      )
    ).rows;
    for (const congress of congresses) {
      congress.inicio = date(congress.fecha_inicio);
      congress.fin = date(congress.fecha_fin);
      const duration =
        (Date.parse(congress.fin) - Date.parse(congress.inicio)) / 86400000 + 1;
      if (duration < 1 || duration > 366)
        throw new Error('Periodo de congreso inválido');
      const previous = (
        await client.query(
          'SELECT id, fecha_evento::text AS fecha, etiqueta FROM dia_evento WHERE congreso_id = $1 ORDER BY fecha_evento FOR UPDATE',
          [congress.id],
        )
      ).rows;
      // Conservar IDs e historial, incluidos los días antiguos fuera del periodo.
      for (let i = 0; i < duration; i++) {
        const fecha = date(
          new Date(Date.parse(congress.inicio) + i * 86400000),
        );
        const old = previous.find((day) => day.fecha === fecha);
        if (old?.etiqueta === `Dia ${i + 1}`) continue;
        const next = (
          await client.query(
            `INSERT INTO dia_evento (congreso_id, fecha_evento, etiqueta) VALUES ($1, $2, $3)
           ON CONFLICT (congreso_id, fecha_evento) DO UPDATE SET etiqueta = EXCLUDED.etiqueta RETURNING id`,
            [congress.id, fecha, `Dia ${i + 1}`],
          )
        ).rows[0];
        report.dias.push({
          congresoId: congress.id,
          antes: old || null,
          despues: { id: next.id, fecha, etiqueta: `Dia ${i + 1}` },
        });
      }
      congress.days = (
        await client.query(
          'SELECT id, fecha_evento::text AS fecha FROM dia_evento WHERE congreso_id = $1 AND fecha_evento BETWEEN $2::date AND $3::date ORDER BY fecha_evento',
          [congress.id, congress.inicio, congress.fin],
        )
      ).rows;
    }
    for (const change of original.cambios) {
      const { table, id } = change;
      if (!['externos', 'participante_nsu'].includes(table))
        throw new Error('Tabla desconocida en el respaldo');
      const amountColumn = table === 'externos' ? 'total' : 'monto_individual';
      const current = (
        await client.query(
          `SELECT id, dias, congreso_id, "diaEventoIds", "${amountColumn}" AS monto FROM ${table} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!current) continue;
      const congress = congresses.find(
        (c) => c.id === change.despues.congresoId,
      );
      if (!congress) throw new Error('No se encontró el congreso original');
      const selected = String(change.antes.dias)
        .split(',')
        .map((entry) => {
          const ordinal = entry.trim().match(/^d[ií]a[\s_]*(\d+)$/i);
          return ordinal
            ? congress.days[Number(ordinal[1]) - 1]
            : congress.days.find(
                (day) => day.fecha === entry || day.id === entry,
              );
        });
      if (!selected.length || selected.some((day) => !day))
        throw new Error('No se pudo recuperar la selección original');
      const ids = selected.map((day) => day.id);
      const dates = selected.map((day) => day.fecha);
      const currentDates = String(current.dias || '').split(',');
      if (
        current.congreso_id === congress.id &&
        same(current.diaEventoIds || [], ids) &&
        same(currentDates, dates)
      )
        continue;
      // Una edición posterior del usuario tiene prioridad sobre el respaldo.
      if (
        current.congreso_id !== congress.id ||
        !same(current.diaEventoIds || [], change.despues.diaEventoIds) ||
        !same(currentDates, change.despues.fechas)
      )
        continue;
      const type = table === 'externos' ? 'EXTERNO' : 'NSU';
      const grants = (
        await client.query(
          `SELECT d.* FROM dia_participante d INNER JOIN participante_acceso p ON p.id = d.participante_id
         WHERE p.tipo = $1 AND p.referencia_id = $2 AND p.congreso_id = $3 AND d.dia_evento_id = ANY($4::uuid[]) FOR UPDATE OF d`,
          [type, id, congress.id, change.despues.diaEventoIds],
        )
      ).rows;
      for (const grant of grants) {
        const target =
          ids[change.despues.diaEventoIds.indexOf(grant.dia_evento_id)];
        if (target === grant.dia_evento_id) continue;
        if (grant.acceso_utilizado) {
          report.pendientes.push({
            table,
            id,
            motivo:
              'Tiene una entrada utilizada; revisar su fecha antes de trasladar permisos.',
          });
          continue;
        }
        const before = (
          await client.query(
            'SELECT * FROM dia_participante WHERE participante_id = $1 AND dia_evento_id = $2',
            [grant.participante_id, target],
          )
        ).rows[0];
        if (before) continue;
        await client.query(
          `INSERT INTO dia_participante (participante_id, dia_evento_id, acceso_utilizado, fecha_ingreso, fecha_actualizacion)
           VALUES ($1, $2, FALSE, NULL, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING`,
          [grant.participante_id, target],
        );
        report.permisos.push({
          participanteId: grant.participante_id,
          diaAnteriorId: grant.dia_evento_id,
          diaNuevoId: target,
          antes: null,
        });
      }
      await client.query(
        `UPDATE ${table} SET dias = $1, "diaEventoIds" = $2 WHERE id = $3`,
        [dates.join(','), ids, id],
      );
      const after = (
        await client.query(
          `SELECT "${amountColumn}" AS monto FROM ${table} WHERE id = $1`,
          [id],
        )
      ).rows[0];
      if (after.monto !== current.monto)
        throw new Error('Se intentó cambiar el importe');
      report.registros.push({
        table,
        id,
        antes: current,
        despues: {
          congresoId: congress.id,
          diaEventoIds: ids,
          fechas: dates,
          monto: after.monto,
        },
      });
    }
    // Detectar registros posteriores fuera del periodo sin adivinar su intención.
    for (const table of ['externos', 'participante_nsu']) {
      const rows = (
        await client.query(
          `SELECT id, congreso_id, "diaEventoIds" FROM ${table} WHERE deleted_at IS NULL AND congreso_id IS NOT NULL`,
        )
      ).rows;
      for (const row of rows) {
        const congress = congresses.find((c) => c.id === row.congreso_id);
        if (!congress) continue;
        if (
          !(row.diaEventoIds || []).length ||
          row.diaEventoIds.some(
            (id) => !congress.days.some((day) => day.id === id),
          )
        )
          report.pendientes.push({
            table,
            id: row.id,
            motivo:
              'Selección fuera del periodo; requiere revisar el registro.',
          });
      }
    }
    if (apply && report.pendientes.length)
      throw new Error(
        'Hay registros pendientes; revisa --plan. No se aplicó ningún cambio.',
      );
    if (apply)
      await fs.writeFile(
        path.join(__dirname, `registration-calendar-repair-${Date.now()}.json`),
        JSON.stringify(report, null, 2) + '\n',
      );
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(
      JSON.stringify(
        {
          aplicado: apply,
          diasCorregidos: report.dias.length,
          registrosCorregidos: report.registros.length,
          permisosAgregados: report.permisos.length,
          pendientes: report.pendientes,
          registros: report.registros.map((r) => ({
            table: r.table,
            id: r.id,
            fechas: r.despues.fechas,
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
