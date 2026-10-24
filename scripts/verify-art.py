"""Read-only source/runtime artwork verification. Requires Pillow."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
assets = (root / "src/assets").resolve()
manifest = json.loads((root / "docs/assets-v3-expanded-manifest.json").read_text(encoding="utf-8"))
outfits = [a for a in manifest["assets"] if "reward" in a]
assert len(outfits) == 24, "Expected 24 approved adult outfits"
verified = 0
for asset in manifest["assets"]:
    if asset.get("status") == "SKIPPED_USER_REQUEST":
        continue
    source = (root / asset["file"]).resolve()
    assert source.parent == assets and source.suffix == ".png", asset["id"]
    sizes = []
    for path, hash_key in [(source, "pngSha256"), (source.with_suffix(".webp"), "webpSha256")]:
        assert path.stat().st_size > 0, f"Empty artwork: {path.name}"
        assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["output"][hash_key], f"Changed artwork: {path.name}"
        with Image.open(path) as image:
            image.load()
            sizes.append(image.size)
            if asset.get("transparent"):
                assert "A" in image.getbands(), f"Missing alpha: {path.name}"
                minimum, maximum = image.getchannel("A").getextrema()
                assert minimum == 0 and maximum > 0, f"Invalid transparency: {path.name}"
    assert sizes[0] == sizes[1], f"Export size mismatch: {source.name}"
    verified += 1

frames = 0
for outfit in outfits:
    for suffix, count in [("", 3), ("-expressions-b", 3), ("-expressions-c", 2)]:
        source = assets / f"wardrobe-v3-{outfit['id']}{suffix}.png"
        with Image.open(source) as image:
            assert abs(image.width / image.height - count / 2) < 0.08, source.name
            for index in range(count):
                cell = image.crop((round(image.width * index / count), 0, round(image.width * (index + 1) / count), image.height))
                bounds = cell.getchannel("A").getbbox()
                assert bounds and bounds[3] - bounds[1] > image.height * 0.65, f"Incomplete frame: {source.name}/{index}"
                frames += 1
    with Image.open(assets / f"outfit-cg-v3-{outfit['id']}.webp") as image:
        assert image.width > 1000 and image.width / image.height > 1.5, outfit["id"]

assert frames == 192
visual_pairs = 0
for visual_manifest in [root / 'docs/assets-v4-manifest.json', root / 'docs/assets-v5-manifest.json', root / 'docs/assets-v6-manifest.json', root / 'docs/assets-v12-manifest.json']:
    if not visual_manifest.exists():
        continue
    for asset in json.loads(visual_manifest.read_text(encoding='utf-8'))['assets']:
        sizes = []
        for kind in ['png', 'webp']:
            path = (root / asset[kind]).resolve()
            assert path.parent == assets and path.suffix == '.' + kind, asset['id']
            assert path.stat().st_size == asset[kind + 'Bytes'], path.name
            assert hashlib.sha256(path.read_bytes()).hexdigest() == asset[kind + 'Sha256'], path.name
            with Image.open(path) as image:
                image.load()
                sizes.append(list(image.size))
                assert 'A' in image.getbands() and image.getchannel('A').getextrema()[0] == 0, path.name
        assert sizes[0] == sizes[1] == asset['size'], asset['id']
        visual_pairs += 1
print(json.dumps({"preservedOriginalPairs": verified, "visualRepairPairs": visual_pairs, "verifiedAssetPairs": verified + visual_pairs, "outfits": len(outfits), "expressionFrames": frames, "runtimeAtlases": 72, "exclusiveCG": 24, "decodeAlphaDimensionsHashes": "PASS"}))
