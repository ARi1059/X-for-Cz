import { createHash, randomUUID } from 'node:crypto';
import { constants, existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp, { type OutputInfo } from 'sharp';
import { immediateTransaction, type Database } from '../storage/database.ts';

export const MEDIA_LIMITS = Object.freeze({ uploadBytes: 10 * 1024 * 1024, pixels: 24_000_000, dimension: 6000, displayEdge: 2500, storageBytes: 500 * 1024 * 1024 });
export type MediaPurpose = 'controlled' | 'public_share';
export type MediaVariant = 'thumbnail' | 'display';
export interface MediaRecord {
  id: string; status: 'pending' | 'ready' | 'failed'; mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number; height: number; bytes: number; lqip: string | null; createdAt: string; purpose: MediaPurpose;
  references: { draft: boolean; publishedVersionCount: number };
}
export class MediaError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const recordSelect = `SELECT m.*, EXISTS(SELECT 1 FROM draft_media_refs d WHERE d.media_id=m.id) AS draft_ref,
  (SELECT COUNT(*) FROM published_media_refs p WHERE p.media_id=m.id) AS published_refs FROM media_assets m`;
function toRecord(row: Record<string, unknown>): MediaRecord {
  return { id: String(row.id), status: row.status as MediaRecord['status'], mimeType: row.mime_type as MediaRecord['mimeType'],
    width: Number(row.width), height: Number(row.height), bytes: Number(row.byte_size), lqip: row.lqip ? String(row.lqip) : null, createdAt: new Date(Number(row.created_at)).toISOString(),
    purpose: row.purpose as MediaPurpose, references: { draft: Boolean(row.draft_ref), publishedVersionCount: Number(row.published_refs) } };
}
function mediaRecord(db: Database, id: string): MediaRecord {
  const row = db.prepare(`${recordSelect} WHERE m.id=?`).get(id);
  if (!row) throw new MediaError(404, 'MEDIA_NOT_FOUND', '图片不存在。');
  return toRecord(row);
}
function assertId(id: string): void {
  if (!idPattern.test(id)) throw new MediaError(400, 'INVALID_MEDIA_ID', '图片标识格式错误。');
}
function mediaDirectory(mediaRoot: string, id: string, storageKey: unknown): string {
  assertId(id);
  if (storageKey !== `${id}/display.webp`) throw new MediaError(500, 'MEDIA_STORAGE_ERROR', '图片存储记录异常。');
  const directory = resolve(mediaRoot, id);
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) throw new MediaError(500, 'MEDIA_STORAGE_ERROR', '图片存储记录异常。');
  return directory;
}
function looksLikeImage(bytes: Uint8Array): boolean {
  return (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes.length > 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (bytes.length > 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP');
}

/** Decode before registration; only stripped derivatives enter private storage. */
export async function importMedia(db: Database, mediaRoot: string, bytes: Uint8Array, options: {
  purpose: MediaPurpose; neutralConfirmed: boolean; actorId?: number;
}): Promise<MediaRecord> {
  if (!['controlled', 'public_share'].includes(options.purpose)
    || typeof options.neutralConfirmed !== 'boolean'
    || options.neutralConfirmed !== (options.purpose === 'public_share')) {
    throw new MediaError(422, 'MEDIA_PURPOSE_INVALID', '请选择图片用途，并单独确认中性分享图片。');
  }
  if (!bytes.length || bytes.length > MEDIA_LIMITS.uploadBytes) throw new MediaError(413, 'MEDIA_TOO_LARGE', '每张图片须大于零且不超过 10 MiB。');
  if (!looksLikeImage(bytes)) throw new MediaError(415, 'MEDIA_FORMAT_INVALID', '请选择真实的 JPEG、PNG 或 WebP 图片。');
  let display: { data: Buffer; info: OutputInfo };
  let thumbnail: Buffer;
  let lqip: string;
  try {
    // Header inspection does not decode pixels; reject dimensions before the bounded decode below.
    const metadata = await sharp(bytes, { limitInputPixels: false, failOn: 'error' }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) {
      throw new MediaError(415, 'MEDIA_FORMAT_INVALID', '仅支持静态 JPEG、PNG 或 WebP 图片。');
    }
    if (!metadata.width || !metadata.height || metadata.width > MEDIA_LIMITS.dimension || metadata.height > MEDIA_LIMITS.dimension
      || metadata.width * metadata.height > MEDIA_LIMITS.pixels) {
      throw new MediaError(413, 'MEDIA_DIMENSIONS_INVALID', '图片最长边限 6000 像素，总像素限 2400 万。');
    }
    // Auto-orient and normalize colour; sharp discards EXIF/XMP/IPTC by default.
    const normalized = sharp(bytes, { limitInputPixels: MEDIA_LIMITS.pixels, failOn: 'error', sequentialRead: true }).rotate().toColourspace('srgb');
    [display, thumbnail, lqip] = await Promise.all([
      normalized.clone().resize({ width: MEDIA_LIMITS.displayEdge, height: MEDIA_LIMITS.displayEdge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true }),
      normalized.clone().resize({ width: 320, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer(),
      normalized.clone().resize({ width: 48, height: 60, fit: 'inside', withoutEnlargement: true }).webp({ quality: 50 }).toBuffer()
        .then(buffer => `data:image/webp;base64,${buffer.toString('base64')}`),
    ]);
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(422, 'MEDIA_DECODE_FAILED', '图片解码失败，请检查文件是否完整及尺寸是否超限。');
  }
  const byteSize = display.data.length + thumbnail.length;
  if (byteSize > MEDIA_LIMITS.uploadBytes) throw new MediaError(413, 'MEDIA_TOO_LARGE', '处理后的图片超出单张容量限制。');
  const id = randomUUID();
  const directory = resolve(mediaRoot, id);
  try {
    immediateTransaction(db, () => {
      // This check and registration share the write lock, including separate-process uploads.
      const used = Number(db.prepare('SELECT COALESCE(SUM(byte_size), 0) AS used FROM media_assets').get()!.used);
      if (used + byteSize > MEDIA_LIMITS.storageBytes) throw new MediaError(507, 'MEDIA_STORAGE_FULL', '图片空间已满，请移除未使用的图片后重试。');
      mkdirSync(resolve(mediaRoot), { recursive: true, mode: 0o700 });
      mkdirSync(directory, { mode: 0o700 });
      writeFileSync(resolve(directory, 'display.webp'), display.data, { mode: 0o600, flag: 'wx' });
      writeFileSync(resolve(directory, 'thumbnail.webp'), thumbnail, { mode: 0o600, flag: 'wx' });
      const now = Date.now();
      db.prepare(`INSERT INTO media_assets(id, storage_key, mime_type, byte_size, width, height, sha256, status, purpose, lqip, created_at)
        VALUES (?, ?, 'image/webp', ?, ?, ?, ?, 'ready', ?, ?, ?)`).run(id, `${id}/display.webp`, byteSize,
        display.info.width, display.info.height, createHash('sha256').update(display.data).digest('hex'), options.purpose, lqip, now);
      db.prepare('INSERT INTO audit_log(action, actor_id, media_id, created_at) VALUES (?, ?, ?, ?)').run('media_registered', options.actorId ?? null, id, now);
    });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    if (error instanceof MediaError) throw error;
    throw new MediaError(500, 'MEDIA_STORAGE_ERROR', '图片保存失败，请稍后重试。');
  }
  return mediaRecord(db, id);
}

export function listMedia(db: Database, options: { cursor?: string; limit?: number } = {}): { items: MediaRecord[]; nextCursor: string | null } {
  const limit = options.limit ?? 30;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (options.cursor !== undefined && !idPattern.test(options.cursor))) {
    throw new MediaError(400, 'INVALID_PAGINATION', '图片分页参数错误。');
  }
  const rows = db.prepare(`${recordSelect} WHERE m.id > ? ORDER BY m.id ASC LIMIT ?`).all(options.cursor ?? '', limit + 1);
  const items = rows.slice(0, limit).map(toRecord);
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
}

/** Caller must first enforce admin access or current published-reference and age access. */
export function readMedia(db: Database, mediaRoot: string, id: string, variant: MediaVariant = 'display'): { bytes: Uint8Array<ArrayBuffer>; mimeType: string } {
  assertId(id);
  if (variant !== 'thumbnail' && variant !== 'display') throw new MediaError(400, 'INVALID_VARIANT', '图片规格错误。');
  const row = db.prepare("SELECT storage_key FROM media_assets WHERE id=? AND status='ready'").get(id);
  if (!row) throw new MediaError(404, 'MEDIA_NOT_FOUND', '图片不存在。');
  const directory = mediaDirectory(mediaRoot, id, row.storage_key);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(resolve(directory, `${variant}.webp`), constants.O_RDONLY | constants.O_NOFOLLOW);
    return { bytes: new Uint8Array(readFileSync(descriptor)), mimeType: 'image/webp' };
  } catch {
    throw new MediaError(404, 'MEDIA_NOT_FOUND', '图片暂未就绪。');
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

export function removeMedia(db: Database, mediaRoot: string, id: string, actorId?: number): void {
  assertId(id);
  let source: string | undefined;
  let trash: string | undefined;
  try {
    immediateTransaction(db, () => {
      const row = db.prepare(`${recordSelect} WHERE m.id=?`).get(id);
      if (!row) throw new MediaError(404, 'MEDIA_NOT_FOUND', '图片不存在。');
      if (row.draft_ref || Number(row.published_refs) > 0) throw new MediaError(409, 'MEDIA_REFERENCED', '图片仍被草稿或发布版本引用。');
      source = mediaDirectory(mediaRoot, id, row.storage_key);
      if (existsSync(source)) {
        trash = resolve(mediaRoot, `.trash-${randomUUID()}`);
        renameSync(source, trash);
      }
      db.prepare('DELETE FROM media_assets WHERE id=?').run(id);
      db.prepare('INSERT INTO audit_log(action, actor_id, media_id, created_at) VALUES (?, ?, ?, ?)').run('media_deleted', actorId ?? null, id, Date.now());
    });
  } catch (error) {
    if (trash && source && existsSync(/* turbopackIgnore: true */ trash)) renameSync(trash, source);
    if (error instanceof MediaError) throw error;
    throw new MediaError(500, 'MEDIA_STORAGE_ERROR', '图片删除失败，请稍后重试。');
  }
  if (trash) rmSync(trash, { recursive: true, force: true });
}
