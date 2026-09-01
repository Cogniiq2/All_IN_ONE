/**
 * ══════════════════════════════════════════════════════════════════════════
 * PROPERTY MEDIA MANIFEST GENERATOR
 *
 * Reads public/images/properties/<property>/<NN-section>/*.jpg|jpeg|png and
 * writes lib/content/property-media.generated.ts.
 *
 * Run it after adding or removing photography:
 *
 *     node scripts/build-property-media.mjs
 *
 * It exists because three facts about these files cannot be known from a path
 * and must not be guessed at render time:
 *
 *   1. DIMENSIONS. Every image needs its width and height in the markup or the
 *      gallery shifts as photographs load.
 *
 *   2. EXIF ORIENTATION. Almost all of this photography was taken on a phone
 *      held upright: the pixels are stored landscape (5712x4284) with an
 *      orientation tag telling the viewer to rotate. Browsers honour that tag,
 *      so the image a visitor sees is 4284x5712 — portrait. The manifest
 *      records the DISPLAYED size, because that is the one the layout has to
 *      reserve space for.
 *
 *   3. DUPLICATES. The same photograph was filed under more than one room.
 *      Copies are byte-different (re-exported, so the metadata differs) but
 *      pixel-identical, so they are matched on the compressed image data
 *      rather than on a hash of the whole file. The first occurrence in folder
 *      order wins; the rest are dropped, listed in the generated header, and
 *      reported by this script when it runs.
 *
 * No dependencies: the JPEG header is parsed here in about forty lines rather
 * than pulling an image library into the toolchain for it.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = 'public/images/properties';
const OUT = 'lib/content/property-media.generated.ts';
const EXTS = new Set(['.jpg', '.jpeg', '.png']);

/** Width, height and EXIF orientation, straight out of the file header. */
function readJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  let width = null;
  let height = null;
  let orientation = 1;

  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    i += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (i + 2 > buf.length) break;
    const length = buf.readUInt16BE(i);
    const seg = buf.subarray(i + 2, i + length);

    // Start Of Frame — any of the baseline/progressive variants.
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof && width === null) {
      height = seg.readUInt16BE(1);
      width = seg.readUInt16BE(3);
    } else if (marker === 0xe1 && seg.subarray(0, 6).toString('latin1') === 'Exif\0\0') {
      const tiff = seg.subarray(6);
      if (tiff.length > 8) {
        const le = tiff.subarray(0, 2).toString('latin1') === 'II';
        const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
        const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
        try {
          const ifd = u32(4);
          const count = u16(ifd);
          for (let e = 0; e < count; e += 1) {
            const entry = ifd + 2 + e * 12;
            if (u16(entry) === 0x0112) orientation = u16(entry + 8);
          }
        } catch {
          /* An unreadable EXIF block just means orientation 1. */
        }
      }
    }
    i += length;
  }
  return width === null ? null : { width, height, orientation };
}

function readPng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  if (!buf.subarray(0, 4).equals(sig)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), orientation: 1 };
}

/**
 * A hash of the compressed image data only.
 *
 * Two exports of one photograph differ in their metadata but carry identical
 * scan data, so this is what identifies a photograph rather than a file.
 */
function pixelHash(buf) {
  const sos = buf.indexOf(Buffer.from([0xff, 0xda]));
  return createHash('sha1').update(sos > 0 ? buf.subarray(sos) : buf).digest('hex');
}

const dirs = (p) => readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory()).sort();

const properties = [];
const dropped = [];
let totalBytes = 0;
let kept = 0;

for (const property of dirs(ROOT)) {
  const sections = [];
  const seen = new Map();

  for (const section of dirs(join(ROOT, property))) {
    const dir = join(ROOT, property, section);
    const images = [];

    for (const file of readdirSync(dir).sort()) {
      if (!EXTS.has(extname(file).toLowerCase())) continue;
      const abs = join(dir, file);
      if (!statSync(abs).isFile()) continue;

      const buf = readFileSync(abs);
      const info = extname(file).toLowerCase() === '.png' ? readPng(buf) : readJpeg(buf);
      if (!info) {
        dropped.push({ why: 'unreadable', at: `${property}/${section}/${file}` });
        continue;
      }

      const hash = pixelHash(buf);
      if (seen.has(hash)) {
        dropped.push({ why: 'duplicate', at: `${property}/${section}/${file}`, of: seen.get(hash) });
        continue;
      }
      seen.set(hash, `${section}/${file}`);

      // Orientations 5-8 rotate by a quarter turn, which swaps the axes.
      const swap = info.orientation >= 5 && info.orientation <= 8;
      images.push({
        src: `/images/properties/${property}/${section}/${file}`,
        width: swap ? info.height : info.width,
        height: swap ? info.width : info.height,
      });
      totalBytes += buf.length;
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
 * under public/images/properties/.
 *
 * Sizes are the DISPLAYED dimensions: EXIF orientation has already been
 * applied, so they match what a browser paints and what the layout must
 * reserve. See the generator for why that matters.
 *
 * ${kept} images, ${(totalBytes / 1e6).toFixed(1)} MB of originals.
${
  dropped.length
    ? ` *\n * Not included:\n${dropped
        .map((d) => ` *   ${d.why === 'duplicate' ? `duplicate of ${d.of}` : d.why}: ${d.at}`)
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
              .map((i) => `          { src: '${i.src}', width: ${i.width}, height: ${i.height} },`)
              .join('\n')}\n        ],\n      },`
        )
        .join('\n')}\n    ],\n  },`
  )
  .join('\n');

writeFileSync(OUT, `${header}${body}\n};\n`);

console.log(`${OUT}: ${kept} images across ${properties.length} properties, ${(totalBytes / 1e6).toFixed(1)} MB`);
for (const p of properties) {
  console.log(`  ${p.property}: ${p.sections.map((s) => `${s.id}(${s.images.length})`).join(' ')}`);
}
if (dropped.length) {
  console.log('\nnot included:');
  for (const d of dropped) {
    console.log(`  ${d.why === 'duplicate' ? `duplicate of ${d.of}` : d.why}: ${d.at}`);
  }
}
