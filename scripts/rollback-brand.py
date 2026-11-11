#!/usr/bin/env python3
"""Restore the brand migration; reject files or content edited afterward."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import time


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--root', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    manifest = json.loads((args.backup / 'manifest.json').read_text())
    root = (args.root or Path(manifest['root'])).resolve()
    for entry in manifest['changes']:
        if digest(root / entry['path']) not in (entry['after'], entry['before']):
            raise SystemExit('Later edits detected; retained: ' + entry['path'])
        if entry['before'] is not None and digest(args.backup / 'originals' / entry['path']) != entry['before']:
            raise SystemExit('Backup hash mismatch: ' + entry['path'])
    state = json.loads((args.backup / 'database-after.json').read_text())
    db = sqlite3.connect(root / 'web/var/site.sqlite')
    db.execute('PRAGMA foreign_keys=ON')
    current = db.execute('SELECT revision,config_json FROM site_draft WHERE id=1').fetchone()
    pointer = db.execute('SELECT version_id FROM published_pointer WHERE id=1').fetchone()[0]
    before = sqlite3.connect(args.backup / 'site-baseline.sqlite')
    prior_config = before.execute('SELECT config_json FROM site_draft WHERE id=1').fetchone()[0]
    prior_pointer = before.execute('SELECT version_id FROM published_pointer WHERE id=1').fetchone()[0]
    before.close()
    already = current[1] == prior_config and pointer == prior_pointer
    if not already and (current[0] != state['draftRevision'] or current[1] != state['draftJson'] or pointer != state['publishedVersionId']):
        raise SystemExit('Later database edits detected; database retained')
    if not args.apply:
        db.close()
        print(json.dumps({'mode':'dry-run','files':len(manifest['changes']),'database':'ready','laterEdits':False}))
        return
    if not already:
        try:
            db.execute('BEGIN IMMEDIATE')
            locked = db.execute('SELECT revision,config_json FROM site_draft WHERE id=1').fetchone()
            locked_pointer = db.execute('SELECT version_id FROM published_pointer WHERE id=1').fetchone()[0]
            if locked != current or locked_pointer != pointer:
                raise RuntimeError('Database changed during rollback preflight')
            now = int(time.time()*1000)
            db.execute('UPDATE site_draft SET revision=?,config_json=?,updated_at=? WHERE id=1',(current[0]+1,prior_config,now))
            config = json.loads(prior_config)
            ids = {config['site']['avatarMediaId'],config['meta']['shareMediaId']}
            ids.update(photo['mediaId'] for photo in config['gallery']['photos'])
            db.execute('DELETE FROM draft_media_refs WHERE draft_id=1')
            for media in ids-{None}:
                db.execute('INSERT INTO draft_media_refs(draft_id,media_id) VALUES(1,?)',(media,))
            db.execute('UPDATE published_pointer SET version_id=? WHERE id=1',(prior_pointer,))
            db.execute("INSERT INTO audit_log(action,draft_revision,created_at) VALUES('draft_saved',?,?)",(current[0]+1,now))
            db.commit()
        except Exception:
            db.rollback()
            raise
    db.close()
    for entry in manifest['changes']:
        path = root/entry['path']
        if entry['before'] is None:
            path.unlink(missing_ok=True)
        else:
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes((args.backup/'originals'/entry['path']).read_bytes())
            path.chmod(entry['mode'])
    assert all(digest(root/entry['path']) == entry['before'] for entry in manifest['changes'])
    print(json.dumps({'mode':'applied','filesRestored':len(manifest['changes']),'databaseRestored':True,'historyRetained':True}))


if __name__ == '__main__':
    main()
