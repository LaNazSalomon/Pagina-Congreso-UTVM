# Personal: roles y validación de entradas

## Permisos

| Acceso | Permisos |
| --- | --- |
| Administrador | Panel administrativo, cuentas del personal, estados de participantes, envío de QR, actividades y reconocimientos. |
| Validador | Escanear QR, consultar sus datos de entrada y confirmar el acceso. |
| Participante | Sus funciones públicas y, con sesión propia, reenviar su QR e inscribirse a talleres para su propio registro. |
| Visitante | Contenido público, registros de participantes y verificación de correo. |

Las cuentas del personal están separadas de EMS, UTVM, NSU y externos, y de los
perfiles Ponente/Panelista/Evaluador. Un mismo correo puede pertenecer a un
participante y a una cuenta de personal, con credenciales y sesiones separadas.

El guard global `AccesoGuard` exige Administrador por defecto en la API. Las
excepciones están declaradas con `Publico`, `Roles` y `AccesoPropio`. Los registros,
el contenido público y las consultas de actividades permanecen públicos. Las
operaciones administrativas, listados de participantes y comprobantes exigen
sesión y permiso. Los alias del frontend heredan los permisos de sus rutas padre.

Los validadores pueden revisar QR de las ediciones del congreso disponibles,
siempre sujetos a sus fechas y reglas de acceso. No se añadió asignación de
validadores por edición ni un rol que combine administración y validación.

## Primera cuenta administradora

Abrir `http://localhost:9000/personal/acceso`. Si no existe personal, aparece
**Crear primera cuenta administradora**. Introducir nombre y correo y pulsar
**Crear cuenta y enviar enlace**. El servidor asigna Administrador y envía
un enlace para elegir la contraseña. Registrar un participante
no crea una cuenta de personal ni concede permisos administrativos.

El alta y envío inicial usan una transacción con bloqueo `gestion-personal`.
Dos solicitudes simultáneas no pueden crear dos primeros administradores. Si
SMTP falla, se revierte esta alta inicial y se puede intentar de nuevo en el
mismo formulario. El registro queda cerrado cuando se confirma la transacción,
aunque todavía no se haya iniciado sesión. Desactivar cuentas no reabre el alta.
No se permite enviar rol, contraseña ni confirmación del correo en el alta pública.
`GET /personal/configuracion-inicial` devuelve únicamente el indicador de alta
inicial y lleva `Cache-Control: no-store`.

## Inicio de sesión y contraseñas

**Personal** es el acceso común para Administradores y Validadores. Se introduce
correo y contraseña; el servidor determina el rol y la redirección. Ya no se
solicitan códigos en cada acceso del personal. Los códigos de participantes y
la verificación de su registro conservan su funcionamiento.

Las altas y los restablecimientos envían un enlace de un solo uso, válido durante
30 minutos. Al abrirlo aparece **Elige tu nueva contraseña**, con contraseña y
confirmación. Debe tener de 8 a 128 caracteres, mayúscula, minúscula, número del
0 al 9 y signo. Las letras acentuadas son válidas; los espacios no cuentan como
signo. La política se aplica tanto en frontend como en el DTO del backend.

Guardar la nueva contraseña confirma el correo, consume el enlace, reemplaza
el hash y cierra las sesiones anteriores. Después se inicia sesión normalmente
con correo y contraseña; no se crea una sesión automáticamente desde el enlace.
No se envían contraseñas temporales en los nuevos correos.

El servidor conserva solamente hashes con sal aleatoria: scrypt N=32768, r=8,
p=3, ejecutado de forma asíncrona y comparado en tiempo constante. Es una de las
configuraciones de [OWASP para scrypt](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt),
implementada con [crypto.scrypt de Node.js](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
Las contraseñas no se devuelven por la API ni se imprimen en logs. Hay límite
por IP en los endpoints de autenticación y diez fallos bloquean la cuenta durante
quince minutos; los intentos se guardan y serializan en PostgreSQL.

La contraseña se envía en el cuerpo JSON de la petición, sin cifrado propio en
JavaScript. Con `http://localhost` ese transporte no está cifrado. En producción
debe servirse el acceso y la API mediante HTTPS/TLS, también cuando se use un proxy
para la API. HTTPS cifra el transporte; scrypt protege lo guardado. Hacer un hash
en el navegador no reemplaza HTTPS. Referencia:
[OWASP: transporte de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#transmit-passwords-only-over-tls-or-other-strong-transport).

## Gestión y restablecimiento

En **Usuarios y roles**, el administrador crea cuentas, edita nombre y rol,
activa/desactiva y pulsa **Restablecer contraseña**. El correo identifica la
cuenta y no cambia desde la edición. Tanto las altas nuevas como los
restablecimientos envían un enlace para que la persona elija su contraseña.
El administrador no elige ni conoce esa contraseña.

Se conserva la decisión de que solo un Administrador envíe estos enlaces desde
el panel. Quien olvide su contraseña contacta a un administrador; no se añadió
una solicitud pública de recuperación por correo.

Enviar el enlace no modifica la contraseña actual ni cierra sesiones. Esto sucede
solo al guardar una nueva contraseña con un enlace válido. Un envío nuevo reemplaza
el enlace anterior. Si SMTP falla, se mantienen el enlace anterior, contraseña y
sesiones. Si falla el envío al crear personal desde el panel, se conserva la cuenta
para reenviar desde la lista. En el alta inicial pública se revierte la transacción
completa si falla el correo para permitir reintentar.

## Enlaces y compatibilidad

El servidor genera 32 bytes aleatorios y guarda solo el SHA-256 del token en
`enlace_contrasena_personal`, con usuario, versión, vencimiento y consumo. Cada
cuenta tiene un enlace vigente como máximo. La consulta no lo consume: abrir el
correo o un previsualizador no cambia la contraseña. El consumo se serializa con
el usuario para impedir dos usos simultáneos. Se rechazan enlaces vencidos,
manipulados, usados, de cuentas desactivadas o de una versión anterior a un
cambio de rol/estado. Las respuestas de estas operaciones llevan `no-store`.

El correo se construye con `FRONTEND_URL`, sin usar el Host enviado por el cliente.
El token va en el fragmento `#token=...` de `/personal/restablecer-contrasena`, que
no se envía al servidor web como URL ni Referer. La página lo retira de la barra
y solo lo conserva en memoria para enviarlo a la API en JSON. Si se recarga
antes de completar, hay que volver a abrir el enlace desde el correo. No registrar
ni compartir estos enlaces o tokens. En producción se debe usar HTTPS.
Referencia: [OWASP: recuperación de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

Las contraseñas personales y sesiones existentes siguen funcionando. Para las
cuentas anteriores sin contraseña que conservan su sesión, **Configurar mi
contraseña** permite enviar un enlace al correo de su propia cuenta. Solo aplica
mientras no tenga contraseña configurada y requiere sesión y CSRF.

Se conserva el cambio inicial con contraseña temporal únicamente para las que ya
se habían enviado antes de este cambio; no se generan temporales nuevas. Los
endpoints antiguos de códigos del personal siguen devolviendo 410 y no envían
correos. `codigo_personal` y los campos de temporal permanecen para compatibilidad.

Si el administrador anterior perdió su sesión antes de configurar su contraseña,
el operador con acceso al servidor puede compilar el backend y ejecutar desde la raíz:

```bash
pnpm --filter backend build
pnpm --filter backend exec node scripts/configurar-contrasena-admin.cjs --correo 'correo@dominio.com'
```

Este comando ahora envía un enlace, sin imprimirlo, únicamente a un Administrador
activo sin contraseña. Para uno que ya tiene contraseña exige añadir explícitamente
`--restablecer`. No cambia la contraseña ni cierra sesiones al enviar; el usuario
lo hace al guardar desde el enlace. Requiere acceso al servidor y sus credenciales,
no es una ruta pública. No se ejecutó contra cuentas reales durante la implementación.

El script `bootstrap-personal-admin.cjs` se conserva como alternativa técnica para
crear la primera cuenta sin correo (`--nombre`, `--correo`, opcional `--plan`).
Después se usa el comando anterior para enviar el enlace. La opción principal
sigue siendo el formulario de acceso.

Las sesiones duran doce horas, usan tokens aleatorios guardados como hash y
cookies HttpOnly, SameSite=Lax, con Secure en producción. Se comprueba la cuenta
actual en cada petición. El cierre de sesión revoca la sesión; cambiar de rol o
activar/desactivar una cuenta revoca sus sesiones y los códigos históricos. No se
permite retirar el último administrador con acceso confirmado, aunque existan
invitaciones pendientes de otros administradores.

Las operaciones privadas de escritura requieren un token CSRF asociado a la
sesión y un origen permitido. Los tokens CSRF del personal y del participante
se mantienen en memoria y se recuperan consultando su sesión. La identidad o
rol guardados en el navegador no conceden permisos en el servidor.
La sesión del personal devuelve `csrfTokenPersonal` para `x-csrf-token`; la de
participantes devuelve `csrfTokenParticipante` para `x-participante-csrf`.

## Validación de entrada

El validador entra en `/validar`, activa la cámara y apunta al QR. También puede
pegar el enlace o usar un lector externo. El QR se interpreta localmente y
únicamente se extrae su token: no se abre una dirección externa leída del código.

El flujo es **escanear → revisar datos → Confirmar entrada**. Consultar el QR
no consume la entrada. Abrir el enlace como participante o visitante lleva al
acceso del personal. Después de autenticarse como validador se vuelve al QR.

La API comprueba el rol, el estado de la cuenta, el token, pago/estado del
participante, congreso, fecha seleccionada y uso previo. Al confirmar vuelve a
comprobar al validador dentro de la transacción. La entrada guarda
`validador_id`, `fecha_ingreso` y `acceso_utilizado`. Las entradas históricas
conservan su información; el validador puede ser nulo en entradas antiguas.

Dos confirmaciones simultáneas producen una sola entrada. Regenerar el QR
conserva el uso previo, la fecha de entrada y la identidad del validador.

La cámara usa `getUserMedia` y [jsQR](https://github.com/cozmo/jsQR). La prueba
automatizada lee un QR generado; queda pendiente la comprobación con una cámara
física. Para usar la cámara desde otro dispositivo se necesita servir la página
en un contexto seguro y configurar las URLs de la aplicación para ese entorno.

## Endpoints bajo `/api`

| Método y ruta | Acceso |
| --- | --- |
| `GET /personal/configuracion-inicial` | Público: indica si falta la primera cuenta, sin datos personales. |
| `POST /personal/configuracion-inicial` | Público solo mientras no exista personal: crear el primer Administrador y enviar el enlace para elegir contraseña. |
| `POST /personal/acceso/entrar` | Correo y contraseña: abrir sesión; conserva el cambio temporal para correos antiguos. |
| `POST /personal/acceso/comprobar-enlace` | Público con token válido: comprobar vigencia sin consumirlo. |
| `POST /personal/acceso/restablecer-contrasena` | Público con token válido: guardar nueva contraseña y consumirlo, sin abrir sesión. |
| `POST /personal/acceso/cambiar-contrasena` | Comprobar la temporal, elegir una nueva y abrir sesión. |
| `POST /personal/acceso/codigo`, `POST /personal/acceso/verificar` | Deshabilitados: devuelven 410 sin enviar correo ni abrir sesión. |
| `POST /personal/contrasena-inicial` | Sesión propia y CSRF: migrar una cuenta anterior que aún no tiene contraseña. |
| `GET /personal/sesion` | Consultar la sesión actual del personal. |
| `POST /personal/cerrar-sesion` | Cerrar la sesión del personal. |
| `GET /personal/usuarios` | Administrador: listar cuentas. |
| `POST /personal/usuarios` | Administrador: crear cuenta e intentar invitar. |
| `PATCH /personal/usuarios/:id` | Administrador: cambiar nombre, rol o estado. |
| `POST /personal/usuarios/:id/restablecer-contrasena` | Administrador: enviar un enlace de un solo uso; conserva accesos hasta guardar la nueva contraseña. |
| `GET /acceso/qr/:token` | Validador: revisar QR. |
| `POST /acceso/qr/:token/confirmar` | Validador: confirmar entrada y registrar actor. |
| `GET /login/sesion` | Consultar sesión propia del participante. |
| `POST /login/cerrar-sesion` | Cerrar sesión del participante. |

Los endpoints de envío automático existentes admiten al administrador o al
participante autenticado que coincide con ese registro. El servidor conserva
sus verificaciones de estado y pago. La inscripción a talleres aplica la misma
comprobación de identidad; EMS/UTVM admiten sus identificadores numéricos.
Las altas públicas por lote EMS/UTVM validan cada elemento y rechazan campos
ajenos al registro, incluidos IDs que podrían sobrescribir una fila existente.

## NSU: fallo de correo y reintento

Una alta NSU queda guardada antes de enviar sus correos. Si falla algún envío,
se intentan los demás y se devuelve 503 explicando que el grupo ya existe.
Repetir el mismo grupo completo de correos, pendiente de pago y con verificaciones
pendientes, reenvía únicamente las verificaciones pendientes. Conserva los datos,
montos y comprobante. No mezcla grupos ni convierte una solicitud parcial en
otro registro. Si falta SMTP ya no imprime enlaces ni informa envío exitoso.

## Datos y comprobaciones

Se añaden `usuario_personal`, `codigo_personal`, `sesion_acceso` y la columna
nullable `dia_participante.validador_id`. El entorno local sigue usando el
`synchronize: true` existente de TypeORM para aplicar el esquema al arrancar;
esta tarea no cambió el mecanismo general de migraciones del proyecto.
Se añade `enlace_contrasena_personal` para los tokens de restablecimiento.
Las columnas de contraseña admiten las cuentas existentes sin borrarlas;
`contrasenaHash` es nullable y no se selecciona en consultas normales.

```bash
# Pruebas de integración: esquema PostgreSQL temporal y correo simulado.
RUN_PERSONAL_INTEGRATION=1 pnpm --filter backend exec jest --runInBand personal.integration.spec
# QR generado y permisos de las rutas/alias del frontend.
pnpm --filter frontend exec node scripts/verify-personal.cjs
```

La integración crea y elimina un esquema propio `roles_test_*`, sin reutilizar
las tablas del entorno local. No envía correos ni sube archivos a Supabase.
No hay despliegue ni cuentas reales de prueba creadas por esas comprobaciones.
