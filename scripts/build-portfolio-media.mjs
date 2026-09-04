/**
 * ══════════════════════════════════════════════════════════════════════════
 * PORTFOLIO BUILDING DERIVATIVES
 *
 * Turns the six architectural drawings in `assets/portfolio-originals/` into
 * transparent WebP files the About page can actually ship.
 *
 *     node scripts/build-portfolio-media.mjs [--force]
 *
 * The originals are read and never written. Delete the output directory and
 * re-run to rebuild from scratch.
 *
 * ── What it does, and why ────────────────────────────────────────────────
 * 1. TRIM TO THE DRAWING. Each PNG is a drawing floating on a transparent
 *    canvas, and the empty margin differs from file to file — one has 221px of
 *    nothing above the roof, another 115. Cropping to the alpha bounding box
 *    makes the image's own edges the building's edges, which is what lets the
 *    procession bottom-align every drawing on one shared ground line in CSS
 *    with no per-building nudging. It also removes megabytes of transparency.
 *
 * 2. FIT INSIDE A BOX. `fit: inside` never crops and never stretches: the
 *    drawing keeps its own proportions and simply stops growing at whichever
 *    edge it meets first. The box is sized for the largest the section ever
 *    renders a building (a ~400×240 CSS box) on a 2× display.
 *
 * 3. WEBP WITH ALPHA. `alphaQuality: 100` keeps the cut-out edge clean —
 *    these are fine pen lines on transparency, and a soft alpha channel shows
 *    as a grey halo against the page. `nearLossless` holds the linework
 *    crisp at a fraction of the PNG's weight.
 *
 * The report it prints (source bytes → output bytes) is what the commit
 * message quotes.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/*
 * The originals live OUTSIDE `public/`. Anything under `public/` is copied
 * verbatim into the Cloudflare asset bundle whether a page references it or
 * not, and these six PNGs are 12 MB of source material no visitor ever
 * requests — the same reason the property photographs were moved to
 * `assets/property-originals/`. They are read here and never written.
 */
const SOURCE_ROOT = 'assets/portfolio-originals';
const OUTPUT_ROOT = 'public/media/portfolio-buildings';

/** Largest box any drawing is rendered into, at 2× device pixel ratio. */
const BOX = { width: 900, height: 560 };

/**
 * Source file → output stem. The addresses are the owners'; nothing here is
 * inferred from the picture. Keep in step with lib/content/portfolio.ts.
 */
const MAP = [
  ['3816889F-8DAD-46F2-9536-AE55DDC273EC.png', 'mainstrasse-14'],
  ['4BCF476B-B364-449B-9649-5F44D2B4D8AB.png', 'am-main-3'],
  ['50C9F1DA-A514-4603-B67F-4EAE6B68F5CF.png', 'harburgerstrasse-5'],
  ['6E19AE2C-F85B-4565-89C5-8AC636A23576.png', 'opernstrasse-1'],
  ['9EA84893-B3CD-472C-ABC7-2D5DE31D4D1A.png', 'riedingerstrasse-13'],
  ['F3151280-62D1-4BA7-B175-DC44380D00FC.png', 'schulstrasse-1'],
];

const force = process.argv.includes('--force');

/** The tightest rectangle containing every pixel that is not fully clear. */
async function alphaBounds(file) {
  const image = sharp(file);
  const { width, height } = await image.metadata();
  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // 8/255 rather than 0: the drawings carry a little anti-aliasing dust
      // that would otherwise widen the box by a few empty pixels.
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error(`${file} is fully transparent`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;

async function main() {
  await mkdir(OUTPUT_ROOT, { recursive: true });

  let sourceTotal = 0;
  let outputTotal = 0;
  const manifest = [];

  for (const [sourceName, stem] of MAP) {
    const source = path.join(SOURCE_ROOT, sourceName);
    const output = path.join(OUTPUT_ROOT, `${stem}.webp`);

    if (!existsSync(source)) throw new Error(`missing source: ${source}`);
    const sourceBytes = (await stat(source)).size;
    sourceTotal += sourceBytes;

    if (existsSync(output) && !force) {
      const bytes = (await stat(output)).size;
      outputTotal += bytes;
      const meta = await sharp(await readFile(output)).metadata();
      manifest.push({ stem, sourceName, width: meta.width, height: meta.height });
      console.log(`· ${stem.padEnd(20)} up to date  ${kb(bytes)}`);
      continue;
    }

    const box = await alphaBounds(source);
    const buffer = await sharp(source)
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .resize({ ...BOX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100, nearLossless: true, effort: 6 })
      .toBuffer();

    await writeFile(output, buffer);
    const meta = await sharp(buffer).metadata();
    outputTotal += buffer.length;
    manifest.push({ stem, sourceName, width: meta.width, height: meta.height });

    const saved = (1 - buffer.length / sourceBytes) * 100;
    console.log(
      `✓ ${stem.padEnd(20)} ${String(box.width).padStart(4)}×${String(box.height).padEnd(4)} cropped` +
        ` → ${meta.width}×${meta.height}  ${kb(sourceBytes)} → ${kb(buffer.length)}  −${saved.toFixed(1)}%`
    );
  }

  console.log(
    `\n  total ${kb(sourceTotal)} → ${kb(outputTotal)}  ` +
      `−${((1 - outputTotal / sourceTotal) * 100).toFixed(1)}%`
  );
  console.log('\n  intrinsic sizes for lib/content/portfolio.ts:');
  for (const m of manifest) console.log(`    ${m.stem}: ${m.width}×${m.height}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
