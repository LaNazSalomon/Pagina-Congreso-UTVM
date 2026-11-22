// Comprueba conexión, TLS y autenticación. No envía mensajes.
const path = require('node:path');
const nodemailer = require('nodemailer');

process.loadEnvFile(path.join(__dirname, '../.env'));

async function main() {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 465);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const secure = process.env.MAIL_SECURE
    ? process.env.MAIL_SECURE === 'true'
    : port === 465;
  if (!host || !user || !pass)
    throw new Error('Faltan MAIL_HOST, MAIL_USER o MAIL_PASS');
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  try {
    await transport.verify();
    console.log(
      JSON.stringify({
        ok: true,
        host,
        port,
        secure,
        mensaje:
          'Conexión y autenticación SMTP correctas. No se enviaron correos.',
      }),
    );
  } finally {
    transport.close();
  }
}

main().catch((error) => {
  const redact = (value) => {
    let text = String(value || '');
    for (const key of ['MAIL_PASS', 'MAIL_USER', 'MAIL_FROM']) {
      if (process.env[key])
        text = text.split(process.env[key]).join('[oculto]');
    }
    return text;
  };
  console.error(
    JSON.stringify({
      ok: false,
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      mensaje: redact(error.message),
      respuesta: redact(error.response),
    }),
  );
  process.exitCode = 1;
});
