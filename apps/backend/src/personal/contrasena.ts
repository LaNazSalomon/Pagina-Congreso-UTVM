import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP: scrypt N=2^15, r=8, p=3. Se ejecuta fuera del hilo de JavaScript.
function derivar(valor: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      valor,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      },
    );
  });
}
export async function hashContrasena(valor: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-32768-8-3:${salt}:${(await derivar(valor, salt)).toString('hex')}`;
}
export async function comprobarContrasena(valor: string, hash: string | null) {
  const [algoritmo, salt, digest] = (hash || '').split(':');
  const valido =
    algoritmo === 'scrypt-32768-8-3' &&
    /^[a-f0-9]{32}$/.test(salt || '') &&
    /^[a-f0-9]{128}$/.test(digest || '');
  // Mismo trabajo para cuentas desconocidas o sin contraseña.
  const actual = await derivar(valor, valido ? salt : '0'.repeat(32));
  return !!valido && timingSafeEqual(actual, Buffer.from(digest, 'hex'));
}
