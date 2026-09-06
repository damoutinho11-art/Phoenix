from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"
EXPECTED = {
    "phoenix-master.png": (1024, 1024),
    "icon-192.png": (192, 192),
    "icon-512.png": (512, 512),
    "icon-maskable-192.png": (192, 192),
    "icon-maskable-512.png": (512, 512),
    "apple-touch-icon.png": (180, 180),
    "favicon-32.png": (32, 32),
}

for name, size in EXPECTED.items():
    with Image.open(ROOT / name) as image:
        assert image.format == "PNG", name
        assert image.size == size, (name, image.size)
        assert image.mode in {"RGB", "RGBA"}, (name, image.mode)
        image.load()

print(f"verified {len(EXPECTED)} Phoenix icon assets")
