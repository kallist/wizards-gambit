"""User-approved WebP export; PNG source artwork is never modified.

Requires Pillow. Usage: python scripts/export-art.py path/to/asset.png
"""
import json
import sys
import tempfile
from pathlib import Path
from PIL import Image

for name in sys.argv[1:]:
    source = Path(name).resolve()
    root = (Path(__file__).resolve().parent.parent / 'src' / 'assets').resolve()
    if source.parent != root or source.suffix.lower() != '.png':
        raise ValueError('Expected a project PNG in src/assets')
    output = source.with_suffix('.webp')
    with tempfile.NamedTemporaryFile(dir=source.parent, prefix='.' + source.stem + '-', suffix='.webp.tmp', delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with Image.open(source) as image:
            image.save(temporary, format='WEBP', quality=90, method=6)
        # Interrupted exports must leave the previous complete asset intact.
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    print(json.dumps(dict(file=output.name, bytes=output.stat().st_size)))
