import type { Runtime } from './runtime.ts';
import { readDraft, readPublished, type Published } from '../storage/site-store.ts';

function localDraftPreviewAllowed(runtime: Runtime): boolean {
  if (runtime.localDraftPreview !== true || process.env.NODE_ENV !== 'development' || runtime.secureCookies) return false;
  try {
    const origin = new URL(runtime.origin);
    return origin.origin === runtime.origin && origin.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  } catch { return false; }
}

/** An explicit loopback development view never changes the published pointer. */
export function readPublicVersion(runtime: Runtime): Published {
  if (!localDraftPreviewAllowed(runtime)) return readPublished(runtime.db);
  const draft = readDraft(runtime.db);
  return {
    versionId: `local-draft-${draft.revision}`,
    sourceRevision: draft.revision,
    config: draft.config,
    createdAt: draft.updatedAt,
    bootstrap: false,
  };
}
