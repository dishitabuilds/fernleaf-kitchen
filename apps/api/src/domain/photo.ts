import { ApiError } from '../common/api-error';

export const MAX_DELIVERY_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map<string, (bytes: Buffer) => boolean>([
  ['image/jpeg', (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'],
]);

/**
 * Decode an optional delivery photo sent as a base64 data URL. The declared type must be JPEG, PNG or WebP and must match
 * the file signature, so arbitrary content cannot be stored and later served back with an image content type.
 */
export function parseDeliveryPhoto(dataUrl: string): { mimeType: string; bytes: Buffer } {
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  const check = match ? ALLOWED.get(match[1]) : undefined;
  if (!match || !check) throw new ApiError(400, 'PHOTO_INVALID', 'Attach a JPEG, PNG or WebP photo.', { photoDataUrl: ['Attach a JPEG, PNG or WebP photo.'] });
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_DELIVERY_PHOTO_BYTES) throw new ApiError(400, 'PHOTO_TOO_LARGE', 'The delivery photo must be 2 MB or smaller.', { photoDataUrl: ['The delivery photo must be 2 MB or smaller.'] });
  if (!check(bytes)) throw new ApiError(400, 'PHOTO_INVALID', 'The photo content does not match its image type.', { photoDataUrl: ['The photo content does not match its image type.'] });
  return { mimeType: match[1], bytes };
}
