// Renders the app icons in public/ from the SVG sources in pwa/.
//
//   npm run icons
//
// The sources are the placeholder mark (the wordmark on a terracotta tile).
// When the real logo lands, replace the four SVGs in pwa/ and run this again;
// nothing else refers to the artwork directly, so the manifest, index.html and
// the service worker pick up the new files unchanged.
//
//   pwa/icon.svg           any-purpose icon (install dialog, desktop, launcher)
//   pwa/icon-maskable.svg  full-bleed, art inside the central 80% circle
//   pwa/favicon.svg        browser tab, legible at 16px
//   pwa/badge.svg          Android status-bar badge: white on transparent
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const src = (name) => path.join(root, 'pwa', name);
const out = (name) => path.join(root, 'public', name);

const renders = [
  ['icon.svg', 'icons/icon-64.png', 64],
  ['icon.svg', 'icons/icon-192.png', 192],
  ['icon.svg', 'icons/icon-512.png', 512],
  ['icon-maskable.svg', 'icons/maskable-192.png', 192],
  ['icon-maskable.svg', 'icons/maskable-512.png', 512],
  // iOS rounds the corners itself and fills any transparency with black, so
  // the touch icon is the full-bleed art, not the pre-rounded tile.
  ['icon-maskable.svg', 'apple-touch-icon.png', 180],
  ['badge.svg', 'icons/badge-96.png', 96],
  ['favicon.svg', 'icons/favicon-32.png', 32],
];

await fs.mkdir(out('icons'), { recursive: true });
for (const [from, to, size] of renders) {
  // Rasterise at the target size (density scales the 512 viewBox), not by
  // shrinking one big bitmap, so small sizes stay sharp.
  const svg = await fs.readFile(src(from));
  const { width } = await sharp(svg).metadata();
  await sharp(svg, { density: (72 * size) / width })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out(to));
  console.log(`${to} (${size}px)`);
}
await fs.copyFile(src('favicon.svg'), out('favicon.svg'));
console.log('favicon.svg');
