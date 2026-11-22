export function extraerTokenQr(value: string): string | null {
  const input = value.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(input)) return input;
  try {
    const url = new URL(input, "https://congreso.local");
    const path = url.hash.startsWith("#/acceso/qr/")
      ? url.hash.slice(1)
      : url.pathname;
    return path.match(/^\/acceso\/qr\/([A-Za-z0-9_-]{43})\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}
