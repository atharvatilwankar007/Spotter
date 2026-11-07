// Draws the Spotter icon (an orange rest-timer arc on near-black) as PNGs, no dependencies.
// Run: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [11, 11, 12];
const A = [255, 176, 58]; // amber
const B = [255, 106, 43]; // orange
const GAP = 0.2; // fraction of the circle left open (the "time left")
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** scale: ring radius as a fraction of size; bg: draw background; rounded: rounded-square mask */
function draw(size, scale, { bg = true, rounded = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const R = size * scale;
  const T = R * 0.3; // stroke width
  const corner = size * 0.22;
  // arc runs clockwise from the top, leaving GAP open before reaching the top again
  const startA = -Math.PI / 2 + GAP * Math.PI * 2;
  const endA = -Math.PI / 2 + Math.PI * 2;
  const capS = [c + Math.cos(startA) * R, c + Math.sin(startA) * R];
  const capE = [c + Math.cos(endA) * R, c + Math.sin(endA) * R];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      let ang = Math.atan2(dy, dx);
      if (ang < startA) ang += Math.PI * 2;
      const inArc = ang >= startA && ang <= endA;
      let dist = inArc ? Math.abs(d - R) : Infinity;
      dist = Math.min(dist, Math.hypot(x + 0.5 - capS[0], y + 0.5 - capS[1]), Math.hypot(x + 0.5 - capE[0], y + 0.5 - capE[1]));
      const cover = 1 - smooth(T / 2 - 1, T / 2 + 1, dist);
      // gradient along the arc: amber at start → orange at end
      const nearStart = Math.hypot(x + 0.5 - capS[0], y + 0.5 - capS[1]) < Math.hypot(x + 0.5 - capE[0], y + 0.5 - capE[1]);
      const t = inArc ? (ang - startA) / (endA - startA) : nearStart ? 0 : 1;
      let ring = mix(A, B, Math.max(0, Math.min(1, t)));
      // subtle top highlight
      ring = mix(ring, [255, 240, 220], Math.max(0, -dy / R) * 0.12);
      // glow
      const glow = Math.exp(-Math.pow(Math.max(0, dist - T / 2) / (T * 0.9), 2)) * 0.35;
      // centre dot (the spotter's eye / start button)
      const dot = 1 - smooth(R * 0.16 - 1, R * 0.16 + 1, d);

      let col = bg ? [...BG] : [0, 0, 0];
      let alpha = bg ? 1 : 0;
      if (bg) col = mix(col, B, glow * 0.5);
      else alpha = Math.max(alpha, glow * 0.5);
      col = mix(col, ring, cover);
      col = mix(col, [243, 239, 231], dot);
      if (!bg) {
        alpha = Math.max(alpha, cover, dot);
        if (cover < 0.01 && dot < 0.01) col = B;
      }
      if (rounded) {
        const qx = Math.max(Math.abs(dx) - (c - corner), 0);
        const qy = Math.max(Math.abs(dy) - (c - corner), 0);
        alpha *= 1 - smooth(corner - 1, corner + 1, Math.hypot(qx, qy));
      }
      const o = (y * size + x) * 4;
      px[o] = Math.round(col[0]);
      px[o + 1] = Math.round(col[1]);
      px[o + 2] = Math.round(col[2]);
      px[o + 3] = Math.round(alpha * 255);
    }
  }
  return png(size, px);
}

function solid(size, rgb) {
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) px.set([...rgb, 255], i * 4);
  return png(size, px);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const pub = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', pub), draw(192, 0.27, { rounded: true }));
writeFileSync(new URL('icon-512.png', pub), draw(512, 0.27, { rounded: true }));
writeFileSync(new URL('icon-maskable-512.png', pub), draw(512, 0.22));

// sources for the Android launcher icons (@capacitor/assets)
const assets = new URL('../assets/', import.meta.url);
mkdirSync(assets, { recursive: true });
writeFileSync(new URL('icon-only.png', assets), draw(1024, 0.24));
writeFileSync(new URL('icon-foreground.png', assets), draw(1024, 0.2, { bg: false }));
writeFileSync(new URL('icon-background.png', assets), solid(1024, BG));
writeFileSync(new URL('splash.png', assets), solid(2732, BG));
writeFileSync(new URL('splash-dark.png', assets), solid(2732, BG));
console.log('icons written');
