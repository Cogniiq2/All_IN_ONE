/**
 * ══════════════════════════════════════════════════════════════════════════
 * PROPERTY MEDIA PIPELINE
 *
 * Reads the source photographs, writes web-sized derivatives, and generates
 * the manifest the site renders from.
 *
 *     node scripts/build-property-media.mjs          # incremental
 *     node scripts/build-property-media.mjs --force  # re-encode everything
 *
 *     assets/property-originals/…  sources. Outside public/, so they are never
 *                  │                served, never shipped to Cloudflare, and
 *                  │                never modified by this script.
 *                  ▼
 *     public/media/properties/…    what visitors actually download
 *                  ▼
 *     lib/content/property-media.generated.ts
 *
 * ── Why the sources live outside public/ ─────────────────────────────────
 * Anything under public/ is served by the site and copied into the Cloudflare
 * asset bundle. The 328 MB of sources are neither wanted: nothing links to
 * them, and shipping them meant uploading 314 MB of unused files on every
 * deploy and leaving them publicly downloadable. They are kept in the
 * repository — every frame, untouched and uncompressed — simply not published.
 *
 * ── Why derivatives exist ────────────────────────────────────────────────
 * The sources are 24-megapixel phone photographs of 2-7 MB each, 328 MB in
 * total. Next.js image optimisation is off in this project (`unoptimized` in
 * next.config.js) and there is no /_next/image endpoint on the Cloudflare
 * worker, so a <Image> tag emits a plain <img> pointing at the source file:
 * the browser was downloading 4.4 MB and decoding 4284x5712 pixels — about
 * 98 MB of bitmap — to paint a 286px card. A room of eleven such photographs
 * is over a gigabyte of decoded image, which is what made an iPad crawl.
 *
 * Two sizes, because two jobs:
 *
 *   DISPLAY  1600px long edge — cards, the detail cover, gallery tiles. Covers
 *            a 2x retina tile and the 630px-wide detail cover with room to
 *            spare. ~100-250 KB.
 *   FULL     2560px long edge — the lightbox only, fetched when a photograph
 *            is actually opened, and enough to stand up to zoom on a floor
 *            plan. ~300-600 KB.
 *
 * WebP for both: universally supported for years (Safari 14 / iOS 14), one
 * encoder, one file per size, no <picture> fan-out to keep in step. AVIF would
 * save perhaps another 15% for several times the encode time and a second set
 * of files to reason about — not a trade worth making here.
 *
 * ── What the manifest records ────────────────────────────────────────────
 * The DERIVATIVE dimensions, measured after encoding rather than computed.
 * Sharp's `.rotate()` bakes EXIF orientation into the pixels, so a derivative
 * has no orientation tag and its width and height are simply what a browser
 * paints — which is what the layout must reserve. (Almost every source here is
 * orientation 6: stored landscape, displayed portrait.)
 *
 * ── Duplicates ───────────────────────────────────────────────────────────
 * The same photograph was filed under more than one room. The copies are
 * byte-different re-exports but pixel-identical, so they are matched on the
 * compressed image data rather than a hash of the whole file. First occurrence
 * in folder order wins; the rest are listed in the generated header and
 * reported here.
 *
 * Only `sharp` is used, which Next.js already depends on. Nothing new was
 * added to the toolchain.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import sharp from 'sharp';

const SOURCE_ROOT = 'assets/property-originals';
const DERIVATIVE_ROOT = 'public/media/properties';
const OUT = 'lib/content/property-media.generated.ts';
const EXTS = new Set(['.jpg', '.jpeg', '.png']);
const FORCE = process.argv.includes('--force');

/** The two sizes the site asks for, and what each is for. */
const VARIANTS = [
  { key: 'display', edge: 1600, quality: 72 },
  { key: 'full', edge: 2560, quality: 76 },
];

/**
 * A hash of the compressed image data only.
 *
 * Two exports of one photograph differ in their metadata but carry identical
 * scan data, so this identifies a photograph rather than a file.
 */
function pixelHash(buf) {
  const sos = buf.indexOf(Buffer.from([0xff, 0xda]));
  return createHash('sha1').update(sos > 0 ? buf.subarray(sos) : buf).digest('hex');
}

const dirs = (p) => readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory()).sort();

const properties = [];
const dropped = [];
let sourceBytes = 0;
let derivativeBytes = 0;
let encoded = 0;
let reused = 0;
let kept = 0;
let largestDerivative = { bytes: 0, path: '' };

for (const property of dirs(SOURCE_ROOT)) {
  const sections = [];
  const seen = new Map();

  for (const section of dirs(join(SOURCE_ROOT, property))) {
    const dir = join(SOURCE_ROOT, property, section);
    const images = [];

    for (const file of readdirSync(dir).sort()) {
      if (!EXTS.has(extname(file).toLowerCase())) continue;
      const abs = join(dir, file);
      if (!statSync(abs).isFile()) continue;

      const buf = readFileSync(abs);
      const hash = pixelHash(buf);
      if (seen.has(hash)) {
        dropped.push({ why: 'duplicate', at: `${property}/${section}/${file}`, of: seen.get(hash) });
        continue;
      }
      seen.set(hash, `${section}/${file}`);
      sourceBytes += buf.length;

      const stem = basename(file, extname(file));
      const outDir = join(DERIVATIVE_ROOT, property, section);
      mkdirSync(outDir, { recursive: true });

      const entry = { src: null, width: 0, height: 0, full: null, fullWidth: 0, fullHeight: 0 };

      for (const variant of VARIANTS) {
        const outFile = join(outDir, `${stem}-${variant.edge}.webp`);
        let info;

        // Re-encoding 90 24-megapixel photographs takes minutes, so a
        // derivative that is already newer than its source is left alone.
        const fresh =
          !FORCE &&
          (() => {
            try {
              return statSync(outFile).mtimeMs >= statSync(abs).mtimeMs;
            } catch {
              return false;
            }
          })();

        if (fresh) {
          const meta = await sharp(outFile).metadata();
          info = { width: meta.width, height: meta.height, size: statSync(outFile).size };
          reused += 1;
        } else {
          const result = await sharp(buf)
            // Bakes EXIF orientation into the pixels: the derivative needs no
            // orientation tag, and its dimensions are what a browser paints.
            .rotate()
            .resize({ width: variant.edge, height: variant.edge, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: variant.quality })
            .toFile(outFile);
          info = { width: result.width, height: result.height, size: result.size };
          encoded += 1;
        }

        derivativeBytes += info.size;
        if (info.size > largestDerivative.bytes) {
          largestDerivative = { bytes: info.size, path: outFile };
        }

        const publicPath = `/${outFile.replace(/^public\//, '')}`;
        if (variant.key === 'display') {
          entry.src = publicPath;
          entry.width = info.width;
          entry.height = info.height;
        } else {
          entry.full = publicPath;
          entry.fullWidth = info.width;
          entry.fullHeight = info.height;
        }
      }

      images.push(entry);
      kept += 1;
    }

    // A section with no photographs is not a section. It must never reach the
    // UI as an empty heading.
    if (images.length > 0) sections.push({ id: section, images });
  }

  if (sections.length > 0) properties.push({ property, sections });
}

const header = `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`node scripts/build-property-media.mjs\` after changing the photography
 * under assets/property-originals/.
 *
 * Every path here points at a WEB DERIVATIVE under public/media/properties/,
 * never at a source photograph. Sizes are the derivative's own dimensions with
 * EXIF orientation already baked in, so they match what a browser paints.
 *
 * ${kept} images. Sources ${(sourceBytes / 1e6).toFixed(1)} MB → derivatives ${(derivativeBytes / 1e6).toFixed(1)} MB.
${
  dropped.length
    ? ` *\n * Not included:\n${dropped
        .map((d) => ` *   duplicate of ${d.of}: ${d.at}`)
        .join('\n')}\n`
    : ''
} */

import type { RawPropertyMedia } from '@/lib/content/property-media';

export const rawPropertyMedia: Record<string, RawPropertyMedia> = {
`;

const body = properties
  .map(
    ({ property, sections }) =>
      `  '${property}': {\n    sections: [\n${sections
        .map(
          (s) =>
            `      {\n        id: '${s.id}',\n        images: [\n${s.images
              .map(
                (i) =>
                  `          {\n` +
                  `            src: '${i.src}',\n` +
                  `            width: ${i.width},\n` +
                  `            height: ${i.height},\n` +
                  `            full: '${i.full}',\n` +
                  `            fullWidth: ${i.fullWidth},\n` +
                  `            fullHeight: ${i.fullHeight},\n` +
                  `          },`
              )
              .join('\n')}\n        ],\n      },`
        )
        .join('\n')}\n    ],\n  },`
  )
  .join('\n');

writeFileSync(OUT, `${header}${body}\n};\n`);

const pct = ((1 - derivativeBytes / sourceBytes) * 100).toFixed(1);
console.log(`${OUT}: ${kept} images across ${properties.length} properties`);
console.log(`  sources     ${(sourceBytes / 1e6).toFixed(1)} MB`);
console.log(`  derivatives ${(derivativeBytes / 1e6).toFixed(1)} MB  (${pct}% smaller, ${encoded} encoded, ${reused} reused)`);
console.log(`  largest derivative: ${(largestDerivative.bytes / 1e6).toFixed(2)} MB  ${largestDerivative.path}`);
for (const p of properties) {
  console.log(`  ${p.property}: ${p.sections.map((s) => `${s.id}(${s.images.length})`).join(' ')}`);
}
if (dropped.length) {
  console.log('\nnot included:');
  for (const d of dropped) console.log(`  duplicate of ${d.of}: ${d.at}`);
}
