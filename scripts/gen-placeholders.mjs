// Generates abstract placeholder images (no stock photos, no people, no logos)
// and one short abstract video for the showreel slot.
// Run: npm run posters   (needs sharp; ffmpeg optional for the video)
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');

function rnd(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const palettes = {
  stage: { bg: '#16171b', mid: '#262830', a: '#e5397f', b: '#ece8e1' },
  ember: { bg: '#141a22', mid: '#22303f', a: '#ff8a4c', b: '#e6eaf0' },
  dusk: { bg: '#1a1712', mid: '#3a3024', a: '#d9a441', b: '#f4ead8' },
  sea: { bg: '#0f1d1f', mid: '#1d3a3d', a: '#3cc8b4', b: '#e2f4f1' },
  paper: { bg: '#e6ebf1', mid: '#cbd3dd', a: '#c2410c', b: '#0e1b2c' },
};

/** Stage beams: for clips / video. */
function beams(w, h, p, seed) {
  const R = rnd(seed);
  let out = `<rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  out += `<defs>`;
  for (let i = 0; i < 4; i++) {
    out += `<linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${i === 0 ? p.a : p.b}" stop-opacity="${i === 0 ? 0.85 : 0.45}"/><stop offset="1" stop-color="${p.bg}" stop-opacity="0"/></linearGradient>`;
  }
  out += `<radialGradient id="floor" cx=".5" cy="1" r=".7"><stop offset="0" stop-color="${p.a}" stop-opacity=".35"/><stop offset="1" stop-color="${p.bg}" stop-opacity="0"/></radialGradient></defs>`;
  out += `<rect width="${w}" height="${h}" fill="url(#floor)"/>`;
  for (let i = 0; i < 4; i++) {
    const x = w * (0.15 + 0.7 * R());
    const spread = w * (0.12 + 0.12 * R());
    out += `<polygon points="${x - w * 0.015},0 ${x + w * 0.015},0 ${x + spread},${h} ${x - spread},${h}" fill="url(#g${i})"/>`;
  }
  return out;
}

/** Layout blocks: for websites. */
function blocks(w, h, p, seed) {
  const R = rnd(seed);
  let out = `<rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  const pad = w * 0.06;
  out += `<rect x="${pad}" y="${h * 0.08}" width="${w - pad * 2}" height="${h * 0.84}" rx="10" fill="${p.mid}"/>`;
  out += `<rect x="${pad}" y="${h * 0.08}" width="${w - pad * 2}" height="${h * 0.07}" rx="10" fill="${p.b}" opacity=".18"/>`;
  out += `<rect x="${pad * 2}" y="${h * 0.24}" width="${w * 0.42}" height="${h * 0.07}" fill="${p.b}" opacity=".8"/>`;
  out += `<rect x="${pad * 2}" y="${h * 0.35}" width="${w * 0.3}" height="${h * 0.035}" fill="${p.b}" opacity=".4"/>`;
  out += `<rect x="${pad * 2}" y="${h * 0.45}" width="${w * 0.14}" height="${h * 0.07}" rx="4" fill="${p.a}"/>`;
  const cols = 3;
  const cw = (w - pad * 4) / cols;
  for (let c = 0; c < cols; c++) {
    out += `<rect x="${pad * 2 + c * cw}" y="${h * 0.6}" width="${cw - w * 0.02}" height="${h * (0.2 + 0.08 * R())}" fill="${c === 1 ? p.a : p.b}" opacity="${c === 1 ? 0.7 : 0.14}"/>`;
  }
  return out;
}

/** Soft fields: for AI images / photos. */
function fields(w, h, p, seed) {
  const R = rnd(seed);
  let out = `<rect width="${w}" height="${h}" fill="${p.bg}"/><defs>`;
  const colors = [p.a, p.b, p.mid, p.a];
  for (let i = 0; i < 4; i++) {
    out += `<radialGradient id="f${i}"><stop offset="0" stop-color="${colors[i]}" stop-opacity="${0.75 - i * 0.12}"/><stop offset="1" stop-color="${colors[i]}" stop-opacity="0"/></radialGradient>`;
  }
  out += `<filter id="blur"><feGaussianBlur stdDeviation="${w / 40}"/></filter></defs><g filter="url(#blur)">`;
  for (let i = 0; i < 4; i++) {
    out += `<ellipse cx="${w * R()}" cy="${h * R()}" rx="${w * (0.2 + 0.3 * R())}" ry="${h * (0.2 + 0.35 * R())}" fill="url(#f${i})"/>`;
  }
  out += `</g>`;
  return out;
}

/** Interface frame: for the product (abstract, no fake data or text). */
function frame(w, h, p, seed) {
  const R = rnd(seed);
  let out = `<rect width="${w}" height="${h}" fill="${p.bg}"/>`;
  out += `<rect x="${w * 0.05}" y="${h * 0.07}" width="${w * 0.9}" height="${h * 0.86}" rx="12" fill="${p.mid}"/>`;
  out += `<rect x="${w * 0.05}" y="${h * 0.07}" width="${w * 0.2}" height="${h * 0.86}" rx="12" fill="${p.b}" opacity=".08"/>`;
  const cols = 4;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const x = w * 0.29 + c * w * 0.155;
      const y = h * 0.15 + r * h * 0.38;
      out += `<rect x="${x}" y="${y}" width="${w * 0.14}" height="${h * 0.32}" rx="6" fill="${(r + c + Math.floor(R() * 3)) % 4 === 0 ? p.a : p.b}" opacity="${0.12 + R() * 0.25}"/>`;
    }
  }
  return out;
}

const painters = { beams, blocks, fields, frame };

async function png(file, w, h, kind, palette, seed) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${painters[kind](w, h, palettes[palette], seed)}</svg>`;
  const out = path.join(root, file);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
  console.log('wrote', file);
}

// Work media (posters, process, before/after, formats, films, previews) is made by scripts/gen-demo-media.mjs.
await png('src/assets/services/video/cover.png', 1600, 900, 'beams', 'stage', 21);
await png('src/assets/services/websites/cover.png', 1600, 900, 'blocks', 'paper', 23);
await png('src/assets/products/event-pro-studio/poster.png', 1600, 1000, 'frame', 'ember', 31);
await png('src/assets/site/showreel-poster.png', 1600, 900, 'beams', 'stage', 41);
await png('public/og-default.png', 1200, 630, 'beams', 'stage', 51);

// Abstract 8s placeholder video (no audio) for the showreel slot.
const video = path.join(root, 'public/media/placeholder-reel.mp4');
if (!existsSync(video)) {
  try {
    execFileSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'gradients=s=1280x720:c0=0x16171b:c1=0xe5397f:c2=0x3a3024:c3=0xece8e1:n=4:speed=0.02:d=8:r=25',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart',
      video,
    ]);
    console.log('wrote public/media/placeholder-reel.mp4');
  } catch (e) {
    console.warn('ffmpeg not available, skipped video:', e instanceof Error ? e.message : e);
  }
}

// Hebrew captions for the placeholder video (shows the captions track works).
await writeFile(
  path.join(root, 'public/media/placeholder-reel.he.vtt'),
  'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nחומר זמני: סרטון מופשט במקום השואוריל\n\n00:00:04.000 --> 00:00:08.000\nאין בסרטון הזה עבודה אמיתית\n',
);
console.log('wrote public/media/placeholder-reel.he.vtt');
