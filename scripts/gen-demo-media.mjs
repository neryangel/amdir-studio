#!/usr/bin/env node
// DEMO media for the portfolio (works with type demo/concept + placeholder: true).
// Everything is generated locally: abstract SVG frames (scripts/demo-painters.mjs) rendered
// with sharp to AVIF, and short silent films / muted preview loops encoded with ffmpeg.
// No people, no logos, no burned-in text: the site labels every demo with the "חומר זמני" badge.
//
//   node scripts/gen-demo-media.mjs            # only what is missing
//   node scripts/gen-demo-media.mjs --force    # regenerate everything
//   node scripts/gen-demo-media.mjs --only clip-original-song
//
// Output per work:
//   src/assets/works/<slug>/*.avif                     poster, process, compare, formats, bts, stills
//   public/media/works/<slug>/film.mp4                  10 s silent demo film (click-to-play facade)
//   public/media/works/<slug>/preview.mp4|.webm         6 s muted loop for the work grid
//   public/media/works/demo-film.he.vtt                 Hebrew captions that say the film is demo material
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { palettes, svg } from './demo-painters.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;

const AVIF = { quality: 50, effort: 5, chromaSubsampling: '4:2:0' };
const ASPECT = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 };
const FILE_ASPECT = (a) => a.replace(':', 'x');

/**
 * Work specs. `poster`/`master` = [painter, opts]. Seeds derive from `seed`.
 * compare: grade = same frame flat (log) vs graded · fx = plate vs composite.
 */
const WORKS = [
  {
    slug: 'clip-original-song', pal: 'magenta', seed: 3, poster: ['stage', {}], film: 'push',
    process: [['storyboard', {}], ['timeline', {}], ['nodes', {}]],
    compare: [{ mode: 'grade', painter: 'stage' }],
    formats: { master: ['stage', {}], aspects: ['16:9', '9:16', '1:1'], focus: 0.42 },
    bts: [['set', { variant: 0 }], ['set', { variant: 2 }], ['set', { variant: 1 }]],
    stills: [['stage', {}], ['bokeh', {}]],
  },
  {
    slug: 'short-ai-clip', pal: 'sea', seed: 17, poster: ['bokeh', {}], vertical: true, film: 'push',
    process: [['storyboard', { vertical: true }], ['timeline', {}]],
    formats: { master: ['bokeh', {}], aspects: ['9:16', '4:5', '1:1'], focus: 0.5, portrait: true },
    stills: [['bokeh', {}], ['horizon', {}]],
  },
  {
    slug: 'event-teaser', pal: 'ember', seed: 9, poster: ['stage', {}], film: 'push',
    process: [['storyboard', {}], ['nodes', {}]],
    compare: [{ mode: 'fx', painter: 'stage' }],
    formats: { master: ['stage', {}], aspects: ['16:9', '9:16'], focus: 0.55 },
    stills: [['stage', {}]],
  },
  {
    slug: 'color-grade-reel', pal: 'dusk', seed: 33, poster: ['horizon', {}], film: 'push',
    process: [['swatch', {}], ['timeline', {}]],
    compare: [{ mode: 'grade', painter: 'horizon' }, { mode: 'grade', painter: 'bokeh' }],
    stills: [['horizon', {}], ['bokeh', {}]],
  },
  {
    slug: 'vfx-breakdown', pal: 'violet', seed: 41, poster: ['horizon', { fx: true }], film: 'push',
    process: [['nodes', {}], ['timeline', {}]],
    compare: [{ mode: 'fx', painter: 'horizon' }, { mode: 'fx', painter: 'stage' }],
    formats: { master: ['horizon', { fx: true }], aspects: ['16:9', '9:16'], focus: 0.5 },
  },
  {
    slug: 'title-sequence', pal: 'ink', seed: 47, poster: ['geo', {}], film: 'anim',
    process: [['storyboard', {}], ['swatch', {}], ['nodes', {}]],
    formats: { master: ['geo', { cx: 0.5 }], aspects: ['16:9', '1:1', '9:16'], focus: 0.5 },
    stills: [['geo', { cx: 0.4 }], ['geo', { cx: 0.7 }]],
  },
  {
    slug: 'live-session', pal: 'amber', seed: 53, poster: ['stage', {}], film: 'push',
    process: [['floorplan', {}], ['storyboard', {}]],
    formats: { master: ['stage', {}], aspects: ['16:9', '9:16'], focus: 0.48 },
    bts: [['set', { variant: 0 }], ['set', { variant: 1 }], ['set', { variant: 2 }]],
    stills: [['stage', {}]],
  },
  {
    slug: 'ai-image-series', pal: 'rose', seed: 11, poster: ['horizon', {}],
    process: [['swatch', {}]],
    compare: [{ mode: 'grade', painter: 'horizon' }],
    formats: { master: ['horizon', {}], aspects: ['4:5', '1:1', '9:16'], focus: 0.5, portrait: true },
    stills: [['horizon', {}], ['bokeh', {}], ['horizon', { fx: true }], ['bokeh', {}]],
  },
  {
    slug: 'single-cover-art', pal: 'sea', seed: 61, poster: ['geo', { cx: 0.5 }], preview: 'anim',
    process: [['swatch', {}], ['storyboard', {}]],
    formats: { master: ['geo', { cx: 0.5 }], aspects: ['1:1', '9:16', '16:9'], focus: 0.5 },
  },
  {
    slug: 'service-business-site', pal: 'paper', seed: 5, poster: ['ui', {}],
    process: [['wire', {}], ['swatch', {}]],
    stills: [['ui', { variant: 'section' }], ['mobile', {}]],
  },
  {
    slug: 'show-landing-page', pal: 'ember', seed: 13, poster: ['ui', { dark: true }],
    process: [['wire', {}]],
    stills: [['ui', { variant: 'section', dark: true }], ['mobile', { dark: true }]],
  },
  {
    slug: 'artist-site', pal: 'violet', seed: 71, poster: ['ui', { dark: true }],
    process: [['wire', {}], ['swatch', {}]],
    stills: [['ui', { variant: 'section', dark: true }], ['mobile', { dark: true }]],
  },
];

const rel = (p) => path.relative(root, p);
async function writeAvif(file, input, resize) {
  if (!force && existsSync(file)) return;
  await mkdir(path.dirname(file), { recursive: true });
  let img = sharp(input);
  if (resize) img = img.resize(resize);
  await img.avif(AVIF).toFile(file);
  console.log('wrote', rel(file));
}
const render = (w, h, [painter, opts], pal, seed) => sharp(Buffer.from(svg(w, h, painter, pal, seed, opts))).png().toBuffer();

/** Log-style flat version of a frame (lifted blacks, low contrast/saturation). */
const flat = (buf) => sharp(buf).modulate({ saturation: 0.35, brightness: 1.06 }).linear(0.55, 52).png().toBuffer();
/** Graded version: a touch more contrast and saturation. */
const graded = (buf) => sharp(buf).modulate({ saturation: 1.12 }).linear(1.08, -6).png().toBuffer();

/** Centre-weighted crop of a master to a target aspect (a real reframe, not a re-render). */
async function cropTo(buf, W, H, aspect, focus) {
  let cw = W;
  let ch = H;
  if (W / H > aspect) cw = Math.round(H * aspect);
  else ch = Math.round(W / aspect);
  const left = Math.max(0, Math.min(W - cw, Math.round(W * focus - cw / 2)));
  const top = Math.round((H - ch) / 2);
  return sharp(buf).extract({ left, top, width: cw, height: ch }).png().toBuffer();
}

function ff(argv) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...argv], { stdio: 'inherit' });
}
const hex = (c) => `0x${c.replace('#', '')}`;

/** Silent film: slow push-in on a frame + a faint moving light wash + grain. */
function pushFilm(still, out, pal, { w, h, seconds }) {
  const p = palettes[pal];
  const grad = `gradients=s=${w}x${h}:c0=${hex(p.bg)}:c1=${hex(p.a)}:c2=${hex(p.c)}:c3=${hex(p.bg)}:n=4:speed=0.015:d=${seconds}:r=25`;
  ff([
    '-loop', '1', '-framerate', '25', '-i', still, '-f', 'lavfi', '-i', grad,
    '-filter_complex',
    `[0:v]scale=${w * 3}:-1,zoompan=z='1.0+0.0004*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=25,format=yuv420p[a];` +
      `[1:v]format=yuv420p[g];[a][g]blend=all_mode=screen:all_opacity=0.16,noise=alls=4:allf=t,format=yuv420p[v]`,
    '-map', '[v]', '-t', String(seconds), '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', out,
  ]);
}

/** Frame-by-frame animation of a painter that understands opts.t (0..1), encoded with ffmpeg. */
async function animFilm(out, spec, pal, seed, { w, h, seconds }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'amdir-anim-'));
  const frames = seconds * 25;
  for (let i = 0; i < frames; i++) {
    const [painter, opts] = spec;
    await sharp(Buffer.from(svg(w, h, painter, pal, seed, { ...opts, t: i / frames })))
      .png({ compressionLevel: 1 })
      .toFile(path.join(dir, `f${String(i).padStart(4, '0')}.png`));
  }
  ff(['-framerate', '25', '-i', path.join(dir, 'f%04d.png'), '-vf', 'noise=alls=3:allf=t,format=yuv420p', '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', out]);
  await rm(dir, { recursive: true, force: true });
}

/** Grid preview (same settings family as scripts/ingest.mjs): 6 s, 480p, muted, MP4 + WebM. */
function previews(src, dir) {
  const base = ['-ss', '1', '-t', '6', '-i', src, '-an'];
  ff([...base, '-vf', "scale=-2:'min(480,ih)':flags=lanczos,fps=25,format=yuv420p", '-c:v', 'libx264', '-profile:v', 'high', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', path.join(dir, 'preview.mp4')]);
  ff([...base, '-vf', "scale=-2:'min(480,ih)':flags=lanczos,fps=25", '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', path.join(dir, 'preview.webm')]);
}

for (const work of WORKS) {
  if (only && work.slug !== only) continue;
  const assets = path.join(root, 'src/assets/works', work.slug);
  const media = path.join(root, 'public/media/works', work.slug);
  await mkdir(assets, { recursive: true });
  const { pal, seed } = work;
  const [PW, PH] = work.vertical ? [1080, 1920] : [1600, 900];

  // Poster (also the source frame for the film).
  const posterPng = await render(PW * 1.2, PH * 1.2, work.poster, pal, seed);
  await writeAvif(path.join(assets, 'poster.avif'), posterPng, { width: PW });

  for (const [i, spec] of (work.process ?? []).entries()) {
    await writeAvif(path.join(assets, `process-${i + 1}.avif`), await render(1600, 900, spec, pal, seed + 100 + i));
  }
  for (const [i, c] of (work.compare ?? []).entries()) {
    const s = seed + 200 + i;
    let before;
    let after;
    if (c.mode === 'grade') {
      const raw = await render(1600, 900, [c.painter, { fx: c.painter === 'stage' }], pal, s);
      before = await flat(raw);
      after = await graded(raw);
    } else {
      before = await render(1600, 900, [c.painter, { fx: false }], pal, s);
      after = await render(1600, 900, [c.painter, { fx: true }], pal, s);
    }
    await writeAvif(path.join(assets, `compare-${i + 1}-before.avif`), before);
    await writeAvif(path.join(assets, `compare-${i + 1}-after.avif`), after);
  }
  if (work.formats) {
    const { master, aspects, focus, portrait } = work.formats;
    const [MW, MH] = portrait ? [1350, 2400] : [2400, 1350];
    const m = await render(MW, MH, master, pal, seed + 300);
    for (const a of aspects) {
      const crop = await cropTo(m, MW, MH, ASPECT[a], focus);
      const long = 1200;
      const resize = ASPECT[a] >= 1 ? { width: long } : { height: long };
      await writeAvif(path.join(assets, `format-${FILE_ASPECT(a)}.avif`), crop, resize);
    }
  }
  for (const [i, spec] of (work.bts ?? []).entries()) {
    await writeAvif(path.join(assets, `bts-${i + 1}.avif`), await render(1200, 800, spec, pal, seed + 400 + i));
  }
  for (const [i, spec] of (work.stills ?? []).entries()) {
    const sq = i % 2 === 1;
    await writeAvif(path.join(assets, `still-${i + 1}.avif`), await render(sq ? 1200 : 1600, sq ? 1200 : 900, spec, pal, seed + 500 + i));
  }

  // Films + preview loops.
  const filmKind = work.film ?? work.preview;
  if (filmKind) {
    await mkdir(media, { recursive: true });
    const film = path.join(media, 'film.mp4');
    const tmpFilm = path.join(tmpdir(), `amdir-${work.slug}-src.mp4`);
    const filmOut = work.film ? film : tmpFilm;
    const needFilm = force || !existsSync(filmOut);
    const needPreview = force || !existsSync(path.join(media, 'preview.mp4'));
    if (needFilm || needPreview) {
      const size = work.vertical ? { w: 540, h: 960, seconds: 10 } : { w: 960, h: 540, seconds: 10 };
      if (filmKind === 'anim') {
        await animFilm(filmOut, work.poster, pal, seed, size);
      } else {
        const still = path.join(tmpdir(), `amdir-${work.slug}-still.png`);
        await sharp(posterPng).resize(size.w * 2, size.h * 2).png().toFile(still);
        pushFilm(still, filmOut, pal, size);
      }
      if (work.film) console.log('wrote', rel(film));
      // Grid previews are always landscape (cards are landscape); vertical works get a landscape render.
      let previewSrc = filmOut;
      if (work.vertical) {
        previewSrc = path.join(tmpdir(), `amdir-${work.slug}-land.mp4`);
        const still = path.join(tmpdir(), `amdir-${work.slug}-land.png`);
        await sharp(await render(1920, 1080, work.poster, pal, seed)).png().toFile(still);
        pushFilm(still, previewSrc, pal, { w: 960, h: 540, seconds: 8 });
      }
      previews(previewSrc, media);
      console.log('wrote', rel(path.join(media, 'preview.{mp4,webm}')));
    }
  }
}

const vtt = path.join(root, 'public/media/works/demo-film.he.vtt');
if (force || !existsSync(vtt)) {
  await mkdir(path.dirname(vtt), { recursive: true });
  await writeFile(
    vtt,
    'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nחומר דמו: סרטון מופשט שנוצר במקום עבודה אמיתית\n\n00:00:05.000 --> 00:00:10.000\nאין בסרטון הזה קול, אנשים או עבודה של לקוח\n',
  );
  console.log('wrote', rel(vtt));
}
