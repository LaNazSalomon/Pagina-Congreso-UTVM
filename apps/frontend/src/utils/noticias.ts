const formatoFechaNoticia = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Mexico_City"
});

export function fechaNoticia(fecha: string) {
  const date = new Date(fecha);
  return Number.isNaN(date.getTime()) ? "" : formatoFechaNoticia.format(date);
}
