# Registro con fechas del congreso

Los formularios de externos y NSU muestran los días reales del congreso:
`Día 1 — 23 de octubre de 2026`, por ejemplo. El número de opciones depende del
periodo configurado, sin un límite fijo de tres días. Se conserva el día de
calendario que guarda el administrador en UTC; convertir ese límite a la hora
de México podía desplazar el inicio al día anterior. `CONGRESS_TIMEZONE`
(`America/Mexico_City`) se mantiene para determinar el día actual al escanear QR.

## Catálogo público

`GET /api/congresos/opciones-registro` devuelve:

- `congresos`: ediciones que no han terminado, ordenadas por fecha inicial.
- Para cada congreso: `id`, `nombre`, `fechaInicio`, `fechaFin`, `dias` y `tarifas`.
- Para cada día: `id`, `fechaEvento` en `AAAA-MM-DD` y `etiqueta`.
- `tarifas`: precios predeterminados anteriores para compatibilidad. Cada
  congreso devuelve sus tarifas vigentes en `congresos[].tarifas`.

La generación de días es idempotente. El catálogo excluye fechas que hayan
quedado fuera del periodo por una edición posterior del congreso. Conserva
todos los días del periodo de un congreso vigente, incluidos días ya pasados.
No se añadió una configuración para deshabilitar jornadas individuales.

## Guardado y cobro

Los nuevos registros envían `congresoId` y `diaEventoIds`. Externos envía los
IDs como campos repetidos del multipart o como arreglo JSON. NSU envía el
congreso en el multipart y los IDs de cada participante en su arreglo JSON.

El servidor valida los IDs, rechaza duplicados y fechas de otra edición, obtiene
las fechas canónicas de la base y verifica el importe. Se guardan `congreso_id`
con una clave foránea a `congreso`, `diaEventoIds` como arreglo UUID y `dias`
con las fechas ISO para consulta y compatibilidad. NSU usa texto para permitir
selecciones de más de tres días sin el antiguo límite de 100 caracteres.

Las tarifas se configuran por congreso desde el módulo **Pagos** del administrador.
Si una edición aún no tiene configuración, conserva los valores anteriores:
externos $250 y NSU $100 por día. El servidor calcula y valida el total con
la tarifa vigente del congreso. Una actualización aplica a inscripciones nuevas;
los importes ya registrados se conservan. Al editar los días de un externo
existente dentro del mismo congreso se mantiene su tarifa original por día.
Si el precio cambia mientras alguien tiene el formulario abierto, el registro
se rechaza con un mensaje explícito y el formulario recarga la tarifa.

El administrador también ve fechas legibles y puede editar los días del externo
dentro de su congreso original. Un cambio de selección recalcula el importe;
editar otros datos conserva el importe original. El CSV de NSU admite fechas
ISO separadas por comas en la celda `dias` (entre comillas en el CSV) y mantiene
compatibilidad con `dia1`, `Día 2` o `dia_3`, relativos al congreso seleccionado.
La importación rechaza días desconocidos y repetidos antes de añadir el grupo.

## QR

El envío automático de externos y NSU usa el congreso y los IDs guardados,
aunque cambie la edición vigente. Se conserva la interpretación de ordinales
para datos antiguos. EMS y UTVM mantienen el acceso a todos los días cuando no
hay selección específica de pago.

El envío manual y la emisión impiden autorizar días fuera de la selección
registrada. La validación de entrada también comprueba esa selección, además
del token, vigencia, estado de pago, fecha y uso previo del QR. Un permiso
antiguo de `dia_participante` no habilita un día retirado del registro.

## Conversión de registros anteriores

```bash
pnpm --filter backend exec node scripts/migrate-registration-days.cjs --plan
pnpm --filter backend exec node scripts/migrate-registration-days.cjs --apply
```

`--plan` simula en una transacción y revierte todo. `--apply` añade las columnas
necesarias y convierte selecciones determinables sin cambiar montos, estados,
correos ni comprobantes. Conserva un informe `registration-days-report-*.json`
con los valores anteriores. La conversión usa el congreso ya vinculado, el de
un QR existente o el único que contiene la fecha de registro. Si la edición o
los días son ambiguos, no aplica cambios y pide revisar el plan.

El 18 de octubre de 2026 se convirtieron cinco externos y tres participantes NSU
sin pendientes. Volver a ejecutar la conversión omite los registros vinculados.

### Corrección del desfase de calendario

Se corrigió el inicio del Congreso 3: `Día 1 — 14 de octubre de 2026`.
El periodo termina el 31 de octubre y contiene 18 días. Las etiquetas se
recalculan desde el inicio real y los IDs de las fechas existentes se conservan.
Los días fuera del periodo quedan excluidos tanto del catálogo como de la
emisión y validación QR, aunque existan filas históricas.

Se repararon los ocho registros de la conversión anterior a partir de sus
ordinales originales: `dia1` corresponde al 14; `dia2,dia3`, al 15 y 16.
Se conservaron importes, comprobantes, estados y datos de contacto. Respaldo:
`apps/backend/scripts/registration-calendar-repair-1792372668452.json`.

```bash
pnpm --filter backend exec node scripts/repair-registration-calendar.cjs --plan
pnpm --filter backend exec node scripts/repair-registration-calendar.cjs --apply
```

El reparador usa el respaldo de la conversión anterior y respeta modificaciones
posteriores del usuario. Conserva las entradas QR históricas y añade los permisos
corregidos si corresponde; si encuentra entradas utilizadas que requieren
revisión, no aplica la reparación. Una segunda simulación confirmó cero cambios
y cero pendientes. No se enviaron correos ni se regeneraron tokens.
