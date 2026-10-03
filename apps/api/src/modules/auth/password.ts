import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const digest = await derive(password, salt);
  return `scrypt$16384$8$1$${salt}$${digest.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, digest, extra] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '16384' || r !== '8' || p !== '1' || !salt || !digest || extra !== undefined) return false;
  const expected = Buffer.from(digest, 'base64url');
  if (expected.length !== 64) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}

// Missing-account attempts do the same expensive password work as existing accounts.
export const dummyPasswordHash = hashPassword(randomBytes(32).toString('base64url'));
