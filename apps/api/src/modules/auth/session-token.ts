import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function csrfTokenForSession(token: string): string {
  return createHmac('sha256', token).update('fernleaf:csrf:v1').digest('base64url');
}

export function validCsrfToken(token: string, provided: string | undefined): boolean {
  if (!provided || !/^[A-Za-z0-9_-]{43}$/.test(provided)) return false;
  return timingSafeEqual(Buffer.from(csrfTokenForSession(token)), Buffer.from(provided));
}
