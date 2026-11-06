import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase, type Database } from '../storage/database.ts';

export interface Runtime {
  db: Database;
  mediaRoot: string;
  origin: string;
  ageSecret: string;
  sessionSecret: string;
  secureCookies: boolean;
  localDraftPreview?: boolean;
}
let cached: Runtime | undefined;

/** Runtime opens an explicitly initialized persistent database; it never seeds or replaces content. */
export function getRuntime(): Runtime {
  if (cached) return cached;
  const { APP_ORIGIN, DATABASE_PATH, MEDIA_ROOT, AGE_SIGNING_SECRET, SESSION_HASH_SECRET } = process.env;
  if (!APP_ORIGIN || !DATABASE_PATH || !MEDIA_ROOT || !AGE_SIGNING_SECRET || !SESSION_HASH_SECRET) {
    throw new Error('Runtime configuration missing; run the local setup command first');
  }
  const url = new URL(APP_ORIGIN);
  const origin = url.origin;
  if (APP_ORIGIN !== origin || !['https:', 'http:'].includes(url.protocol)) throw new Error('APP_ORIGIN must be an exact HTTP(S) origin');
  if (url.protocol !== 'https:' && (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('HTTPS is required outside local development');
  }
  if (AGE_SIGNING_SECRET.length < 32 || SESSION_HASH_SECRET.length < 32 || AGE_SIGNING_SECRET === SESSION_HASH_SECRET) {
    throw new Error('Two independent secrets of at least 32 characters are required');
  }
  const filename = resolve(DATABASE_PATH);
  if (!existsSync(filename)) throw new Error('Database must be initialized before starting the service');
  const db = openDatabase(filename);
  try {
    if (!db.prepare('SELECT id FROM site_draft WHERE id = 1').get()) throw new Error('Site is not initialized');
  } catch (error) { db.close(); throw error; }
  const localDraftPreview = process.env.LOCAL_DRAFT_PREVIEW === '1' && process.env.NODE_ENV === 'development'
    && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  cached = { db, mediaRoot: resolve(MEDIA_ROOT), origin, ageSecret: AGE_SIGNING_SECRET, sessionSecret: SESSION_HASH_SECRET, secureCookies: url.protocol === 'https:', localDraftPreview };
  return cached;
}
