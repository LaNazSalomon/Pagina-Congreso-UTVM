export const REGISTRO_TARIFAS = { EXTERNO: 250, NSU: 100 } as const;

export function calcularTotalRegistro(dias: number, tarifa: number): number {
  return (dias * Math.round(tarifa * 100)) / 100;
}
