# Datos de prueba del administrador

Desde la raíz del repositorio:

```bash
pnpm --filter backend build
pnpm --filter backend exec node scripts/seed-admin.cjs --inspect
pnpm --filter backend exec node scripts/seed-admin.cjs --apply
pnpm --filter backend exec node scripts/seed-admin.cjs --verify
```

Usa la base y los buckets configurados en `apps/backend/.env`. Sin argumentos,
con `--inspect` o con `--plan`, solo consulta los conteos.

`--apply` completa hasta tres registros activos por apartado: congresos,
ubicaciones, conferencias, talleres, foros, reconocimientos, cada categoría de
participantes y cada tipo de perfil (ponente, panelista y evaluador). Completa
también tres equipos y tres evaluadores por Hackatón. Las noticias, secciones y
banners se asocian al congreso más reciente, que selecciona inicialmente el
administrador. La agenda se obtiene de las conferencias y talleres.

Los datos nuevos llevan `Prueba` en el nombre y usan correos `@example.com`.
No se envían correos. Los externos de prueba tienen correo verificado para
aparecer en el administrador; los registros anteriores pendientes no se
modifican. Los externos y registros NSU nuevos permiten probar estados pendiente,
validado y rechazado. Incluyen comprobantes PDF identificados como ficticios.
Los banners usan el logotipo existente como imagen y permanecen inactivos; las
noticias y secciones permanecen en borrador. Los congresos nuevos usan periodos
anteriores para conservar la selección de la edición existente.

La carga usa una transacción y un bloqueo para serializar ejecuciones. No
actualiza ni elimina registros existentes. Si falla, revierte las inserciones y
elimina los archivos recién subidos. Repetir la carga no añade registros cuando
las listas ya tienen tres. Cada ejecución conserva un informe JSON con los IDs
creados y los objetos subidos, sin credenciales. `--verify` comprueba esos IDs y
descarga los archivos para validar sus firmas PDF/PNG.

## Diagnóstico de correo

Desde la raíz:

```bash
pnpm --filter backend exec node scripts/check-smtp.cjs
```

Comprueba conexión, TLS y autenticación con la configuración de
`apps/backend/.env`. No envía mensajes, no cambia registros y oculta las
credenciales en los errores. Limita los tiempos de espera de la conexión.

El 18 de octubre de 2026 Gmail respondió `EAUTH`, `535 5.7.8`,
`Username and Password not accepted`. La conexión funciona; es necesario
revisar `MAIL_USER` y sustituir `MAIL_PASS` por una contraseña de aplicación
válida para esa misma cuenta. Google requiere verificación en dos pasos para
crear esas contraseñas: [instrucciones oficiales](https://support.google.com/accounts/answer/185833?hl=es).
No guardar ni compartir contraseñas en informes o chats.

Después de actualizar `.env`, repetir el diagnóstico y reiniciar el backend
para cargar las credenciales nuevas. El externo pendiente puede reenviar su
verificación al registrar de nuevo el mismo correo, sin duplicar sus datos.

## Primera cuenta administradora

La opción principal está en `/personal/acceso`: cuando no hay cuentas, registra
nombre y correo, crea el primer Administrador y envía un enlace de un solo uso
para elegir su contraseña. El enlace vence en 30 minutos.
Si el correo del alta inicial falla, la transacción se revierte y se puede
reintentar. Las siguientes cuentas y los restablecimientos de contraseña se
gestionan desde **Usuarios y roles**.

Las cuentas anteriores que conservan su sesión pueden pulsar **Configurar mi
contraseña**. Si el administrador ya perdió esa sesión, el operador del servidor
puede configurar su contraseña inicial desde la raíz:

```bash
pnpm --filter backend build
pnpm --filter backend exec node scripts/configurar-contrasena-admin.cjs --correo 'correo@dominio.com'
```

No imprime tokens ni contraseñas; envía un enlace al correo de un administrador
activo sin contraseña configurada. Para recuperar técnicamente una cuenta administradora
que ya tiene contraseña, exige añadir `--restablecer` explícitamente. Invalida
la contraseña y las sesiones previas cuando el usuario guarda la nueva desde el enlace. No ejecutarlo
como diagnóstico: sí envía un correo de recuperación.

Se conserva como alternativa técnica la creación inicial sin enviar correo:

```bash
pnpm --filter backend exec node scripts/bootstrap-personal-admin.cjs --nombre 'Nombre completo' --correo 'correo@dominio.com' --plan
pnpm --filter backend exec node scripts/bootstrap-personal-admin.cjs --nombre 'Nombre completo' --correo 'correo@dominio.com'
```

`--plan` revierte la inserción. El comando real no crea otro administrador si
ya existe uno activo. Después se usa `configurar-contrasena-admin.cjs` para
enviar su enlace inicial. No usar correos ficticios para la cuenta real.

Detalles: [Personal y roles](../../../docs/api/personal-roles.md).

Diagnóstico de solo lectura, sin enviar correos:

```bash
pnpm --filter backend exec node scripts/check-personal-access.cjs
```

Oculta parte del correo e informa si hay contraseña configurada, enlaces de
recuperación, bloqueo y datos históricos de temporales y códigos. No muestra hashes ni
contraseñas. Si devuelve `totalCuentas: 0`, falta crear la primera cuenta.
