import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';

export const API_CONFIG = Symbol('API_CONFIG');

export interface ApiConfig {
  databaseUrl: string;
  webOrigin: string;
  port: number;
  production: boolean;
  sessionTtlHours: number;
  maintenanceToken?: string;
}

export function readConfig(): ApiConfig {
  loadEnvironment({ path: resolve(__dirname, '..', '.env'), quiet: true });
  const databaseUrl = process.env.DATABASE_URL;
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const port = Number(process.env.PORT ?? '3001');
  const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS ?? '12');
  const production = process.env.NODE_ENV === 'production';
  const maintenanceToken = process.env.MAINTENANCE_TOKEN || undefined;
  if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must contain a PostgreSQL connection URL.');
  }
  const url = new URL(webOrigin);
  if (url.origin !== webOrigin || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('WEB_ORIGIN must be one exact HTTP(S) origin without a trailing slash.');
  }
  if (production && url.protocol !== 'https:') {
    throw new Error('Production WEB_ORIGIN must use HTTPS.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 168) {
    throw new Error('SESSION_TTL_HOURS must be an integer between 1 and 168.');
  }
  if (maintenanceToken && (maintenanceToken.length < 32 || maintenanceToken.length > 512 || /\s/.test(maintenanceToken))) {
    throw new Error('MAINTENANCE_TOKEN must contain 32 to 512 characters without whitespace, or remain unset to disable external jobs.');
  }
  return { databaseUrl, webOrigin, port, production, sessionTtlHours, maintenanceToken };
}
