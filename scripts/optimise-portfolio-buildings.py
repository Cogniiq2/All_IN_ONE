#!/usr/bin/env python3
"""
Regenerate the About-page portfolio building derivatives.

    pip install Pillow
    python3 scripts/optimise-portfolio-buildings.py

Reads the untouched originals in `public/images/portfolio-buildings/` and
writes transparent WebP derivatives to `public/media/portfolio-buildings/`.
The originals are never modified.

Three things happen to each drawing, and all three matter to the layout:

  1. It is cropped to its own alpha bounding box. The source PNGs carry
     different amounts of empty margin, so without this the buildings could
     not share a baseline without per-item CSS nudging.
  2. Sub-threshold alpha speckle is cleared and the RGB of fully transparent
     pixels is set to white, so lossy WebP cannot bleed a dark halo out of
     the transparent surround.
  3. It is downscaled to roughly 2× its largest rendered size.

The MAP below is the authoritative drawing → address mapping and must stay in
step with `lib/content/portfolio-buildings.ts`.
"""

import os

from PIL import Image

SRC = 'public/images/portfolio-buildings'
OUT = 'public/media/portfolio-buildings'

MAP = [
    ('3816889F-8DAD-46F2-9536-AE55DDC273EC.png', 'maximilianstrasse-14'),
    ('4BCF476B-B364-449B-9649-5F44D2B4D8AB.png', 'am-main-3'),
    ('50C9F1DA-A514-4603-B67F-4EAE6B68F5CF.png', 'harburgerstrasse-5'),
    ('6E19AE2C-F85B-4565-89C5-8AC636A23576.png', 'opernstrasse-1'),
    ('9EA84893-B3CD-472C-ABC7-2D5DE31D4D1A.png', 'riedingerstrasse-10'),
    ('F3151280-62D1-4BA7-B175-DC44380D00FC.png', 'schulstrasse-1'),
]

MAX_W = 900
MAX_H = 640
ALPHA_FLOOR = 10
QUALITY = 82


def build(src_name: str, slug: str) -> tuple[int, int, tuple[int, int]]:
    src = os.path.join(SRC, src_name)
    im = Image.open(src).convert('RGBA')

    solid = im.getchannel('A').point(lambda v: 255 if v >= ALPHA_FLOOR else 0)
    im = im.crop(solid.getbbox())

    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < ALPHA_FLOOR else v)
    white = Image.new('L', im.size, 255)
    transparent = a.point(lambda v: 255 if v == 0 else 0)
    for channel in (r, g, b):
        channel.paste(white, (0, 0), transparent)
    im = Image.merge('RGBA', (r, g, b, a))

    scale = min(MAX_W / im.width, MAX_H / im.height, 1.0)
    if scale < 1.0:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)

    dst = os.path.join(OUT, f'{slug}.webp')
    im.save(dst, 'WEBP', quality=QUALITY, method=6, alpha_quality=100)
    return os.path.getsize(src), os.path.getsize(dst), im.size


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    total_src = total_out = 0
    print(f"{'slug':24} {'source':>10} {'webp':>10} {'saved':>7}  dimensions")
    for src_name, slug in MAP:
        s, o, size = build(src_name, slug)
        total_src += s
        total_out += o
        print(f'{slug:24} {s / 1024:9.0f}K {o / 1024:9.1f}K {100 - o / s * 100:6.1f}%  {size[0]}×{size[1]}')
    print(
        f'{"TOTAL":24} {total_src / 1024:9.0f}K {total_out / 1024:9.1f}K '
        f'{100 - total_out / total_src * 100:6.1f}%'
    )


if __name__ == '__main__':
    main()
