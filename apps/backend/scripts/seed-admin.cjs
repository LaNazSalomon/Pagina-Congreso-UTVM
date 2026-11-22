// Completa las listas del administrador hasta tres registros activos.
// Sin argumentos consulta los conteos; --apply inserta los faltantes.
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
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
const noSoftDelete = new Set([
  'ubicacion',
  'archivo_multimedia',
  'participante_acceso',
]);
const created = [];
const uploaded = [];
const summary = [];
let storage;
let committed = false;
const quote = (value) => {
  if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(value))
    throw new Error('Identificador inválido');
  return `"${value}"`;
};
const date = (value) => new Date(value).toISOString().slice(0, 10);
function offsetDate(value, days) {
  const result = new Date(`${date(value)}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return date(result);
}
const email = (type) =>
  `prueba.${type}.${randomUUID().slice(0, 8)}@example.com`;

async function rows(table, condition = 'TRUE', params = []) {
  return (
    await client.query(
      `SELECT * FROM ${quote(table)} WHERE ${noSoftDelete.has(table) ? '' : 'deleted_at IS NULL AND '}(${condition}) ORDER BY id`,
      params,
    )
  ).rows;
}

async function insert(table, data) {
  const keys = Object.keys(data);
  const result = await client.query(
    `INSERT INTO ${quote(table)} (${keys.map(quote).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    keys.map((key) => data[key]),
  );
  created.push({ table, id: result.rows[0].id });
  return result.rows[0];
}

async function fill(label, table, make, condition = 'TRUE', params = []) {
  const existing = await rows(table, condition, params);
  const before = existing.length;
  for (let index = before; index < 3; index++)
    existing.push(await make(index + 1));
  summary.push({
    apartado: label,
    antes: before,
    creados: existing.length - before,
    total: existing.length,
  });
  return existing;
}

function getStorage() {
  storage ??=
    require('../dist/archivo_multimedia/services/supabase-client.factory').createSupabaseClient();
  return storage;
}

async function upload(bucket, objectPath, buffer, contentType) {
  const { error } = await getStorage()
    .storage.from(bucket)
    .upload(objectPath, buffer, {
      contentType,
      cacheControl: '0',
      upsert: false,
    });
  if (error)
    throw new Error(`No se pudo subir el archivo de prueba: ${error.message}`);
  uploaded.push({ bucket, path: objectPath });
}

async function voucher(origin, person, amount) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 420]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  [
    'COMPROBANTE DE PRUEBA - SIN VALIDEZ',
    `Participante: ${person}`,
    `Registro: ${origin.toUpperCase()}`,
    `Monto ficticio: $${amount}.00 MXN`,
    'Documento creado solamente para pruebas del administrador.',
  ].forEach((text, index) =>
    page.drawText(text, {
      x: 40,
      y: 350 - index * 45,
      size: index ? 12 : 18,
      font,
      color: rgb(0.1, 0.2, 0.2),
    }),
  );
  const buffer = Buffer.from(await pdf.save());
  const objectPath = `${origin}/prueba-${randomUUID()}.pdf`;
  await upload(
    process.env.SUPABASE_VOUCHERS_BUCKET || 'comprobantes-pago',
    objectPath,
    buffer,
    'application/pdf',
  );
  return insert('archivo_comprobante', {
    nombre_original: `comprobante-prueba-${origin}.pdf`,
    path: objectPath,
    mime_type: 'application/pdf',
    size: buffer.length,
  });
}

async function bannerImage() {
  const buffer = await fs.readFile(
    path.join(__dirname, '../../frontend/src/components/logo1.png'),
  );
  const bucket = process.env.SUPABASE_BUCKET || 'congreso-imagenes';
  const objectPath = `imagenes/banners/prueba-${randomUUID()}.png`;
  await upload(bucket, objectPath, buffer, 'image/png');
  return insert('archivo_multimedia', {
    subido_por_usuario_id: 'e0efb875-4dc6-449b-8f45-832a728f2757',
    ruta_archivo: getStorage().storage.from(bucket).getPublicUrl(objectPath)
      .data.publicUrl,
    path: objectPath,
    tipo_mime: 'image/png',
  });
}

async function inspect() {
  const tables = [
    'congreso',
    'ubicacion',
    'conferencia',
    'taller',
    'ponente',
    'externos',
    'ems',
    'utvm',
    'registro_nsu',
    'hackaton',
    'hackaton_equipo',
    'hackaton_evaluador',
    'foro_empresarial',
    'reconocimiento',
    'noticia',
    'seccion_contenido',
    'banner',
  ];
  const counts = {};
  for (const table of tables) counts[table] = (await rows(table)).length;
  console.log(
    JSON.stringify(
      {
        counts,
        perfiles: (
          await client.query(
            'SELECT tipo, COUNT(*) FROM ponente WHERE deleted_at IS NULL GROUP BY tipo',
          )
        ).rows,
        externosVisibles: (await rows('externos', '"correoVerificado" = TRUE'))
          .length,
        equiposPorHackaton: (
          await client.query(
            'SELECT hackaton_id, COUNT(*) FROM hackaton_equipo WHERE deleted_at IS NULL GROUP BY hackaton_id',
          )
        ).rows,
        contenidoPorCongreso: (
          await client.query(`SELECT 'noticias' AS tipo, congreso_id, COUNT(*) FROM noticia WHERE deleted_at IS NULL GROUP BY congreso_id
      UNION ALL SELECT 'secciones', congreso_id, COUNT(*) FROM seccion_contenido WHERE deleted_at IS NULL GROUP BY congreso_id
      UNION ALL SELECT 'banners', congreso_id, COUNT(*) FROM banner WHERE deleted_at IS NULL GROUP BY congreso_id`)
        ).rows,
      },
      null,
      2,
    ),
  );
}

async function seed() {
  await client.query('BEGIN');
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('seed-admin-tres-registros'))",
    );
    const initialCongresses = (await rows('congreso')).sort(
      (a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio),
    );
    const earliest = initialCongresses.at(-1)?.fecha_inicio || new Date();
    const congresos = await fill('Congresos', 'congreso', (index) =>
      insert('congreso', {
        nombre: `Prueba - Congreso ${index}`,
        eslogan: 'Edición ficticia para pruebas del administrador',
        ubicacion: 'Campus de prueba UTVM',
        fecha_inicio: `${offsetDate(earliest, -7 * index)}T00:00:00`,
        fecha_fin: `${offsetDate(earliest, -7 * index + 2)}T23:59:59`,
      }),
    );
    const primary = initialCongresses[0] || congresos[0];
    const inicio = date(primary.fecha_inicio);
    let primaryDay = (
      await client.query(
        'SELECT id, fecha_evento::text AS fecha FROM dia_evento WHERE congreso_id = $1 AND fecha_evento = $2::date LIMIT 1',
        [primary.id, inicio],
      )
    ).rows[0];
    if (!primaryDay) {
      const createdDay = await insert('dia_evento', {
        congreso_id: primary.id,
        fecha_evento: inicio,
        etiqueta: 'Dia 1',
      });
      primaryDay = { id: createdDay.id, fecha: inicio };
    }
    const ubicaciones = await fill('Ubicaciones', 'ubicacion', (index) =>
      insert('ubicacion', {
        nombre: `Prueba - Sala ${randomUUID().slice(0, 6)}`,
        capacidad: 30 + index * 10,
      }),
    );
    const profiles = {};
    for (const tipo of ['Ponente', 'Panelista', 'Evaluador']) {
      profiles[tipo] = await fill(
        tipo,
        'ponente',
        (index) =>
          insert('ponente', {
            usuario_id: randomUUID(),
            nombre: `Prueba ${tipo} ${index}`,
            institucion: 'Institución ficticia de pruebas',
            tipo,
            semblanza:
              'Perfil ficticio para probar altas, edición, actividades y reconocimientos.',
            tema: [
              'Innovación tecnológica',
              'Desarrollo de software',
              'Emprendimiento',
            ][index - 1],
            visible_publico: false,
          }),
        'tipo = $1',
        [tipo],
      );
    }
    const testSpeakers = profiles.Ponente.filter((item) =>
      item.nombre.startsWith('Prueba '),
    );
    const conferenceRows = await fill('Conferencias', 'conferencia', (index) =>
      insert('conferencia', {
        titulo: `Prueba - Conferencia ${index}`,
        resumen:
          'Actividad ficticia para probar la agenda y su administración.',
        fecha: date(primary.fecha_inicio),
        hora_inicio: `${8 + index}:00`,
        hora_fin: `${9 + index}:00`,
        congreso_id: primary.id,
        ubicacion_id: ubicaciones[(index - 1) % ubicaciones.length].id,
        ponente_id: (
          testSpeakers[(index - 1) % testSpeakers.length] ||
          profiles.Ponente[index - 1]
        ).id,
      }),
    );
    const tallerRows = await fill('Talleres', 'taller', (index) =>
      insert('taller', {
        titulo: `Prueba - Taller ${index}`,
        descripcion:
          'Taller ficticio para probar cupos, inscripciones y reconocimientos.',
        cupo_maximo: 20,
        requisitos: 'Computadora portátil. Actividad de prueba.',
        fecha: date(primary.fecha_inicio),
        hora_inicio: `${13 + index}:00`,
        hora_fin: `${14 + index}:00`,
        congreso_id: primary.id,
        ubicacion_id: ubicaciones[(index - 1) % ubicaciones.length].id,
        ponente_id: (
          testSpeakers[(index - 1) % testSpeakers.length] ||
          profiles.Ponente[index - 1]
        ).id,
      }),
    );
    await fill('Foros empresariales', 'foro_empresarial', (index) =>
      insert('foro_empresarial', {
        nombre: `Prueba - Foro empresarial ${index}`,
        direccion: `Campus de prueba, sala ${index}`,
        resena: 'Foro ficticio para pruebas de vinculación y administración.',
        congreso_id: primary.id,
        ubicacion_id: ubicaciones[index - 1].id,
      }),
    );
    for (const table of ['ems', 'utvm']) {
      await fill(`Participantes ${table.toUpperCase()}`, table, (index) =>
        insert(table, {
          nombres: `Prueba ${table.toUpperCase()} ${index}`,
          apellidoPaterno: 'Demostración',
          apellidoMaterno: 'Sistema',
          correo: email(table),
          telefono: `550000000${index}`,
          ...(table === 'ems'
            ? { institucion: 'Bachillerato de prueba', carrera: 'Informática' }
            : { cuatrimestre: index + 1, grupo: `TI-${index}` }),
        }),
      );
    }
    await fill(
      'Participantes externos visibles',
      'externos',
      async (index) => {
        const nombre = `Prueba Externo ${index}`;
        const comprobante = await voucher('externos', nombre, 250);
        return insert('externos', {
          nombre,
          apellidoPaterno: 'Demostración',
          apellidoMaterno: 'Sistema',
          correo: email('externo'),
          telefono: `550000001${index}`,
          institucion: 'Empresa ficticia de prueba',
          dias: primaryDay.fecha,
          congreso_id: primary.id,
          diaEventoIds: [primaryDay.id],
          total: 250,
          correoVerificado: true,
          status: ['pendiente', 'validado', 'rechazado'][index - 1],
          comprobanteId: comprobante.id,
        });
      },
      '"correoVerificado" = TRUE',
    );
    await fill('Registros NSU', 'registro_nsu', async (index) => {
      const nombre = `Prueba NSU ${index}`;
      const comprobante = await voucher('nsu', nombre, 100);
      const estado = ['PENDIENTE', 'VALIDADO', 'RECHAZADO'][index - 1];
      const registro = await insert('registro_nsu', {
        total_general: 100,
        total_participantes: 1,
        estado_pago: estado,
        comprobanteId: comprobante.id,
      });
      await insert('participante_nsu', {
        es_tutor: true,
        correo_verificado: true,
        nombre_completo: `${nombre} Demostración`,
        correo: email('nsu'),
        institucion: 'Universidad ficticia de prueba',
        carrera: 'Tecnologías de la información',
        telefono: `550000002${index}`,
        dias: primaryDay.fecha,
        congreso_id: primary.id,
        diaEventoIds: [primaryDay.id],
        monto_individual: 100,
        estado_pago: estado,
        registroId: registro.id,
      });
      return registro;
    });
    const hackatones = await fill('Hackatones', 'hackaton', async (index) => {
      const used = new Set(
        (await rows('hackaton')).map((item) => item.congreso_id),
      );
      const congreso = congresos.find((item) => !used.has(item.id));
      if (!congreso)
        throw new Error(
          'No hay un congreso disponible para el Hackatón de prueba',
        );
      return insert('hackaton', {
        nombre: `Prueba - Hackatón ${index}`,
        descripcion:
          'Hackatón ficticio para probar equipos, evaluadores y resultados.',
        congreso_id: congreso.id,
        fecha_inicio: date(congreso.fecha_inicio),
        fecha_fin: date(congreso.fecha_fin),
      });
    });
    const testPeople = [
      ...(await rows('utvm', "correo LIKE 'prueba.%@example.com'")),
      ...(await rows('ems', "correo LIKE 'prueba.%@example.com'")),
    ];
    for (const hackaton of hackatones) {
      const eligible = [];
      for (const person of testPeople) {
        const tipo = person.grupo ? 'UTVM' : 'EMS';
        const found = (
          await rows(
            'participante_acceso',
            'tipo = $1 AND referencia_id = $2 AND congreso_id = $3',
            [tipo, String(person.id), hackaton.congreso_id],
          )
        )[0];
        eligible.push(
          found ||
            (await insert('participante_acceso', {
              tipo,
              referencia_id: String(person.id),
              congreso_id: hackaton.congreso_id,
            })),
        );
      }
      await fill(
        `Equipos (${hackaton.nombre})`,
        'hackaton_equipo',
        async (index) => {
          const occupied = new Set(
            (
              await rows('hackaton_integrante', 'hackaton_id = $1', [
                hackaton.id,
              ])
            ).map((item) => item.participante_id),
          );
          const participant = eligible.find((item) => !occupied.has(item.id));
          if (!participant)
            throw new Error(
              'Faltan participantes ficticios disponibles para los equipos',
            );
          const nombre = `Prueba - Equipo ${index}`;
          const team = await insert('hackaton_equipo', {
            hackaton_id: hackaton.id,
            nombre,
            nombre_normalizado: nombre.toLocaleLowerCase('es-MX'),
          });
          await insert('hackaton_integrante', {
            hackaton_id: hackaton.id,
            equipo_id: team.id,
            participante_id: participant.id,
          });
          return team;
        },
        'hackaton_id = $1',
        [hackaton.id],
      );
      await fill(
        `Evaluadores (${hackaton.nombre})`,
        'hackaton_evaluador',
        async () => {
          const assigned = new Set(
            (
              await rows('hackaton_evaluador', 'hackaton_id = $1', [
                hackaton.id,
              ])
            ).map((item) => item.ponente_id),
          );
          const evaluador = profiles.Evaluador.find(
            (item) => !assigned.has(item.id),
          );
          return insert('hackaton_evaluador', {
            hackaton_id: hackaton.id,
            ponente_id: evaluador.id,
          });
        },
        'hackaton_id = $1',
        [hackaton.id],
      );
    }
    const activities = [
      ...conferenceRows
        .filter((item) => item.titulo.startsWith('Prueba - '))
        .map((item) => ({
          ...item,
          table: 'conferencia',
          tipo: 'CONFERENCISTA',
        })),
      ...tallerRows
        .filter((item) => item.titulo.startsWith('Prueba - '))
        .map((item) => ({ ...item, table: 'taller', tipo: 'TALLERISTA' })),
    ];
    await fill('Reconocimientos', 'reconocimiento', async () => {
      const existing = new Set(
        (await rows('reconocimiento')).map((item) => item.clave_emision),
      );
      const activity = activities.find(
        (item) =>
          !existing.has(`${item.table}:${item.id}:ponente:${item.ponente_id}`),
      );
      if (!activity)
        throw new Error(
          'Faltan actividades ficticias para preparar los reconocimientos',
        );
      const person = (
        await rows('ponente', 'id = $1', [activity.ponente_id])
      )[0];
      return insert('reconocimiento', {
        clave_emision: `${activity.table}:${activity.id}:ponente:${person.id}`,
        congreso_id: activity.congreso_id,
        [`${activity.table}_id`]: activity.id,
        ponente_id: person.id,
        tipo: activity.tipo,
        nombre_destinatario: person.nombre,
        estado: 'PENDIENTE',
      });
    });
    await fill(
      'Página oficial: noticias',
      'noticia',
      (index) =>
        insert('noticia', {
          titulo: `Prueba - Noticia ${index}`,
          slug: `prueba-noticia-${randomUUID().slice(0, 8)}`,
          cuerpo:
            'Noticia ficticia para probar edición, filtros y vista previa. Sin publicar.',
          estado: 'borrador',
          congreso_id: primary.id,
        }),
      'congreso_id = $1',
      [primary.id],
    );
    await fill(
      'Página oficial: información general',
      'seccion_contenido',
      (index) =>
        insert('seccion_contenido', {
          clave_seccion: `prueba_${randomUUID().slice(0, 8)}`,
          titulo: `Prueba - Información ${index}`,
          cuerpo:
            'Información ficticia para pruebas del administrador. Sin publicar.',
          estado: 'borrador',
          congreso_id: primary.id,
        }),
      'congreso_id = $1',
      [primary.id],
    );
    await fill(
      'Página oficial: banners',
      'banner',
      async (index) =>
        insert('banner', {
          titulo: `Prueba - Banner ${index}`,
          activo: false,
          orden: index,
          congreso_id: primary.id,
          archivo_multimedia_id: (await bannerImage()).id,
        }),
      'congreso_id = $1',
      [primary.id],
    );
    await client.query('COMMIT');
    committed = true;
    const report = {
      fecha: new Date().toISOString(),
      congresoContenido: primary.id,
      summary,
      created,
      uploaded,
    };
    const reportPath = path.join(
      __dirname,
      `seed-admin-report-${Date.now()}.json`,
    );
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.table(summary);
    console.log(
      `Registros creados: ${created.length}. Archivos subidos: ${uploaded.length}. Informe: ${reportPath}`,
    );
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK');
      for (const item of uploaded) {
        const { error: cleanupError } = await getStorage()
          .storage.from(item.bucket)
          .remove([item.path]);
        if (cleanupError)
          console.error(
            `No se pudo limpiar ${item.path}: ${cleanupError.message}`,
          );
      }
    }
    throw error;
  }
}

async function verify() {
  const reports = (await fs.readdir(__dirname)).filter((name) =>
    /^seed-admin-report-\d+\.json$/.test(name),
  );
  const uploads = [];
  for (const name of reports) {
    const report = JSON.parse(
      await fs.readFile(path.join(__dirname, name), 'utf8'),
    );
    for (const item of report.created) {
      const result = await client.query(
        `SELECT id FROM ${quote(item.table)} WHERE id = $1`,
        [item.id],
      );
      if (result.rowCount !== 1)
        throw new Error(
          `No se encontró el registro creado: ${item.table}/${item.id}`,
        );
    }
    uploads.push(...report.uploaded);
  }
  const checks = await Promise.allSettled(
    uploads.map(async (item) => {
      const { data, error } = await getStorage()
        .storage.from(item.bucket)
        .download(item.path);
      if (error)
        throw new Error(`No se pudo descargar ${item.path}: ${error.message}`);
      const buffer = Buffer.from(await data.arrayBuffer());
      const valid = item.path.endsWith('.pdf')
        ? buffer.subarray(0, 5).toString('ascii') === '%PDF-'
        : buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!valid) throw new Error(`Archivo de prueba inválido: ${item.path}`);
    }),
  );
  const failed = checks.filter((item) => item.status === 'rejected');
  if (failed.length)
    throw new Error(failed.map((item) => item.reason.message).join('\n'));
  await inspect();
  console.log(
    `Informes verificados: ${reports.length}. Archivos descargados y validados: ${checks.length}.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg) => !['--inspect', '--plan', '--apply', '--verify'].includes(arg),
    )
  )
    throw new Error('Argumento no reconocido');
  await client.connect();
  await client.query("SET statement_timeout = '20s'");
  await client.query("SET lock_timeout = '10s'");
  if (args.includes('--apply')) await seed();
  else if (args.includes('--verify')) await verify();
  else await inspect();
}

main()
  .catch((error) => {
    console.error(error.code || error.name, error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
