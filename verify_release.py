"""Validate published web assets without runtime data or third-party dependencies."""
import hashlib
import json
import os
from pathlib import Path
root = Path(__file__).resolve().parent
public = root / 'public'
manifest = json.loads((root / 'asset-manifest.json').read_text(encoding='utf-8'))
for relative, expected in manifest.items():
    path = (public / relative).resolve()
    if not path.is_relative_to(public.resolve()):
        raise ValueError('Invalid public asset path')
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('Public asset checksum mismatch: ' + relative)
release = json.loads((public / 'release.json').read_text(encoding='utf-8'))
release['site_revision'] = os.environ.get('RENDER_GIT_COMMIT', 'local')
(public / 'release.json').write_text(json.dumps(release, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'verified_assets': len(manifest), 'release': release}))
