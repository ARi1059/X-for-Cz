CREATE TABLE administrators (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 1 AND 128),
  password_hash TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  administrator_id INTEGER NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
  csrf_hash TEXT NOT NULL CHECK (length(csrf_hash) = 64 AND csrf_hash NOT GLOB '*[^0-9a-f]*'),
  auth_version INTEGER NOT NULL CHECK (auth_version > 0),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
) STRICT;
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE age_revocations (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX age_revocations_expiry ON age_revocations(expires_at);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE CHECK (length(storage_key) > 0),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  purpose TEXT NOT NULL DEFAULT 'controlled' CHECK (purpose IN ('controlled', 'public_share')),
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE site_draft (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision > 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE draft_media_refs (
  draft_id INTEGER NOT NULL REFERENCES site_draft(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  PRIMARY KEY (draft_id, media_id)
) STRICT;

CREATE TABLE published_versions (
  id INTEGER PRIMARY KEY,
  source_revision INTEGER NOT NULL CHECK (source_revision > 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  config_sha256 TEXT NOT NULL CHECK (length(config_sha256) = 64),
  bootstrap INTEGER NOT NULL DEFAULT 0 CHECK (bootstrap IN (0, 1)),
  created_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES administrators(id) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX one_bootstrap_version ON published_versions(bootstrap) WHERE bootstrap = 1;

CREATE TABLE published_media_refs (
  version_id INTEGER NOT NULL REFERENCES published_versions(id) ON DELETE RESTRICT,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  PRIMARY KEY (version_id, media_id)
) STRICT;

CREATE TABLE published_pointer (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version_id INTEGER NOT NULL REFERENCES published_versions(id) ON DELETE RESTRICT
) STRICT;

CREATE TRIGGER published_versions_no_update BEFORE UPDATE ON published_versions
BEGIN SELECT RAISE(ABORT, 'published versions are immutable'); END;
CREATE TRIGGER published_versions_no_delete BEFORE DELETE ON published_versions
BEGIN SELECT RAISE(ABORT, 'published versions are retained'); END;
CREATE TRIGGER published_refs_no_update BEFORE UPDATE ON published_media_refs
BEGIN SELECT RAISE(ABORT, 'published media references are immutable'); END;
CREATE TRIGGER published_refs_no_delete BEFORE DELETE ON published_media_refs
BEGIN SELECT RAISE(ABORT, 'published media references are retained'); END;

CREATE TRIGGER published_media_no_update BEFORE UPDATE ON media_assets
WHEN EXISTS (SELECT 1 FROM published_media_refs WHERE media_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'published media assets are immutable'); END;

CREATE TABLE daily_statistics (
  day TEXT NOT NULL CHECK (length(day) = 10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  source TEXT NOT NULL CHECK (source IN ('profile', 'pin', 'weekly', 'other')),
  event TEXT NOT NULL CHECK (event IN ('gate_view', 'adult_confirm', 'leave', 'link_click')),
  link_id TEXT NOT NULL CHECK (link_id IN ('', 'x_profile', 'tg_personal', 'tg_preview', 'onlyfans', 'membership')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  CHECK ((event = 'link_click' AND link_id <> '') OR (event <> 'link_click' AND link_id = '')),
  PRIMARY KEY (day, source, event, link_id)
) STRICT;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('draft_saved', 'site_published', 'media_registered', 'media_deleted', 'password_changed', 'administrator_initialized', 'session_created', 'session_revoked')),
  actor_id INTEGER REFERENCES administrators(id) ON DELETE RESTRICT,
  draft_revision INTEGER,
  version_id INTEGER REFERENCES published_versions(id) ON DELETE RESTRICT,
  media_id TEXT,
  created_at INTEGER NOT NULL
) STRICT;
