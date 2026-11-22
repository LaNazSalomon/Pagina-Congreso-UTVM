# Hackatón: evaluadores y reconocimientos

Base: `/api/hackatones`.

La pestaña **Evaluadores** permite agregar perfiles de tipo Evaluador en
cualquier momento, incluso cuando el Hackatón terminó o ya se descargaron
reconocimientos. Los botones de descarga se habilitan nuevamente al terminar
cada solicitud. El estado emitido no impide descargar un PDF o ZIP otra vez.

## Agregar evaluadores

`POST /:id/evaluadores`

```json
{
  "ponente_ids": ["uuid-del-perfil-evaluador"]
}
```

Agrega los perfiles indicados sin quitar ni modificar las asignaciones
existentes. Repetir un ID ya asignado no duplica la asignación. No requiere
cambiar las fechas del Hackatón. Responde `404` si falta el Hackatón o un perfil,
y `400` si el perfil no tiene tipo Evaluador.

`PUT /:id/evaluadores` conserva el reemplazo de la lista completa. Las
asignaciones con reconocimiento emitido no pueden eliminarse mediante este
endpoint; sí pueden conservarse mientras se agregan otros evaluadores.

## Descargar el ZIP completo

`POST /:id/reconocimientos/evaluadores/zip`

Responde `application/zip`, con un PDF por evaluador actualmente asignado.
Cada descarga incluye también a quienes se agregaron desde la descarga
anterior. Responde `400` si no hay evaluadores asignados.

## Descargar un reconocimiento individual

`POST /:hackatonId/evaluadores/:evaluadorId/reconocimiento/pdf`

`evaluadorId` es el ID de la **asignación**, recibido en
`hackaton.evaluadores[].id`. Responde `application/pdf` con
`Content-Disposition: attachment`. Se puede usar antes o después de descargar
el ZIP y repetir cuantas veces sea necesario. Responde `404` si la asignación
no existe o pertenece a otro Hackatón.

El PDF individual y el ZIP comparten el mismo registro de reconocimiento por
Hackatón y perfil: no se crean reconocimientos duplicados por descarga. La
primera fecha de emisión se conserva, los intentos se incrementan y solo se
marcan como emitidas las asignaciones incluidas. Si falla la generación, se
puede reintentar; un reconocimiento previamente emitido conserva ese estado.
