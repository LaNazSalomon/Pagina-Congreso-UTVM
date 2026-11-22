# API: Registro NSU

El envio del QR se documenta en [`qr-acceso.md`](./qr-acceso.md). Endpoint:
`POST /registro-nsu/:registroId/participantes/:participanteId/qr-acceso/enviar`.

Base URL: `http://localhost:3000/api`

El alta y la verificación de correo son públicas. Los listados, comprobantes y
operaciones administrativas exigen Administrador. El envío automático de QR
también admite al participante autenticado de ese registro. Consultar
[sesiones y permisos](personal-roles.md).

Los endpoints de registro usan `multipart/form-data` porque incluyen la subida de un comprobante de pago.

## Campos del DTO

### CreateParticipanteNsuDto

| Campo | Tipo | Requerido | Reglas |
| --- | --- | --- | --- |
| `nombreCompleto` | string | Si | Maximo 200 caracteres |
| `correo` | string | Si | Debe ser email valido, maximo 150 caracteres |
| `institucion` | string | Si | Maximo 200 caracteres |
| `carrera` | string | Si | Maximo 200 caracteres |
| `telefono` | string | Si | Solo numeros, exactamente 10 digitos |
| `dias` | string | Si | Fechas ISO separadas por coma; el servidor las obtiene de los IDs |
| `diaEventoIds` | UUID[] | Si | Fechas únicas que pertenecen al congreso seleccionado |
| `montoNumero` | number | Si | Minimo 0 |

### CreateRegistroNsuDto

| Campo | Tipo | Requerido | Reglas |
| --- | --- | --- | --- |
| `participantes` | CreateParticipanteNsuDto[] | Si | Arreglo con minimo 1 participante |
| `congresoId` | UUID | Si | Congreso de todos los participantes del grupo |
| `comprobante` | file | Si | PDF, JPG, JPEG o PNG validos, max 5MB |

---

## GET /comprobantes/:comprobanteId/visualizar

Redirige a una URL firmada del voucher privado, valida por cinco minutos. El
identificador se obtiene de `comprobante.id` en la respuesta del registro.

---

## GET /registro-nsu/verificar-correo/:token

Verifica el correo electronico de un participante NSU.

```http
GET {{base_url}}/registro-nsu/verificar-correo/{{token}}
```

Respuesta esperada: `200 OK`.

```json
{
  "mensaje": "Correo verificado exitosamente"
}
```

Errores posibles:
- `400 Bad Request` — token invalido o expirado.

---

## POST /registro-nsu

Registra participantes NSU con comprobante de pago.

```http
POST {{base_url}}/registro-nsu
Content-Type: multipart/form-data
```

Campos del form-data:

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| `participantes` | string | Arreglo JSON de participantes |
| `comprobante` | file | Archivo PDF, JPG, JPEG o PNG valido (max 5MB) |

Ejemplo con curl:

```bash
curl -X POST http://localhost:3000/api/registro-nsu \
  -F 'congresoId={{congreso_id}}' \
  -F 'participantes=[{"nombreCompleto":"Juan Perez","correo":"juan@nsu.edu.mx","institucion":"Universidad Nacional","carrera":"Ing. Sistemas","telefono":"8112345678","dias":"2026-10-23,2026-10-24","diaEventoIds":["{{dia_evento_1_id}}","{{dia_evento_2_id}}"],"montoNumero":200}]' \
  -F "comprobante=@comprobante.pdf"
```

Respuesta esperada: `201 Created`.

```json
{
  "id": "{{registro_id}}",
  "total_general": 200,
  "total_participantes": 1,
  "estado_pago": "PENDIENTE",
  "participantes": [
    {
      "id": "{{participante_id}}",
      "nombre_completo": "Juan Perez",
      "correo": "juan@nsu.edu.mx",
      "institucion": "Universidad Nacional",
      "carrera": "Ing. Sistemas",
      "telefono": "8112345678",
      "dias": "2026-10-23,2026-10-24",
      "monto_individual": 200
    }
  ]
}
```

Errores posibles:
- `400 Bad Request` — campo `participantes` no es JSON valido.
- `400 Bad Request` — archivo no adjuntado o formato no valido.
- `400 Bad Request` — archivo invalido o supera 5MB.
- `503 Service Unavailable` — el grupo quedó guardado pero falló uno o más
  correos de verificación. Repetir el mismo grupo completo pendiente reenvía los
  correos no verificados sin duplicar el registro ni el comprobante. El reintento
  devuelve el ID del grupo original y un mensaje de reenvío.

---

## GET /registro-nsu

Lista todos los registros NSU.

```http
GET {{base_url}}/registro-nsu
```

Respuesta esperada: `200 OK`.

```json
[
  {
    "id": "{{registro_id}}",
    "total_general": 200,
    "total_participantes": 1,
    "estado_pago": "PENDIENTE",
    "participantes": [...]
  }
]
```

---

## GET /registro-nsu/:id

Obtiene un registro NSU por ID.

```http
GET {{base_url}}/registro-nsu/{{registro_id}}
```

Respuesta esperada: `200 OK`.

```json
{
  "id": "{{registro_id}}",
  "total_general": 200,
  "total_participantes": 1,
  "estado_pago": "PENDIENTE",
  "participantes": [...]
}
```

Respuesta si no existe: `404 Not Found`.

```json
{
  "message": "No se encontro el registro NSU con el id {{registro_id}}",
  "error": "Not Found",
  "statusCode": 404
}
```

---

## DELETE /registro-nsu/:id

Elimina un registro NSU (soft delete).

```http
DELETE {{base_url}}/registro-nsu/{{registro_id}}
```

Respuesta esperada: `200 OK`.

```json
{
  "id": "{{registro_id}}",
  "total_general": 200,
  ...
}
```

---

## PATCH /registro-nsu/:id/participantes/:participanteId

Actualiza el estado de pago de una sola persona sin eliminarla del registro.

```json
{
  "estado_pago": "RECHAZADO"
}
```

Los valores admitidos son `PENDIENTE`, `VALIDADO` y `RECHAZADO`.

## DELETE /registro-nsu/:id/participantes/:participanteId

Elimina de forma lógica únicamente al participante indicado. Este endpoint no
debe utilizarse para rechazar pagos.

---

## PATCH /registro-nsu/:id/restore

Restaura un registro NSU previamente eliminado.

```http
PATCH {{base_url}}/registro-nsu/{{registro_id}}/restore
```

Respuesta esperada: `200 OK`.

```json
{
  "id": "{{registro_id}}",
  "total_general": 200,
  ...
}
```
