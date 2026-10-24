// Build-time OpenGraph PNGs (1200x630), rendered with sharp, which Astro already uses for images.
// No new dependency: text is laid out by sharp's Pango renderer using the site's own self-hosted
// fonts (@fontsource). Pango cannot read WOFF reliably, so the WOFF files are unpacked to plain
// TrueType once (WOFF1 = zlib-compressed sfnt tables) into the OS temp dir.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import type { Direction } from './enums';
import { OG_HEIGHT, OG_WIDTH } from './og';

/** WOFF 1.0 -> sfnt (TrueType/OpenType). Throws on anything that is not WOFF 1.0. */
export function woffToSfnt(woff: Uint8Array): Buffer {
  const buf = Buffer.from(woff);
  if (buf.toString('ascii', 0, 4) !== 'wOFF') throw new Error('Not a WOFF 1.0 file');
  const flavor = buf.readUInt32BE(4);
  const numTables = buf.readUInt16BE(12);
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(numTables * 16 - searchRange, 10);
  const parts: Buffer[] = [header];
  let offset = header.length;
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = buf.readUInt32BE(e);
    const tableOffset = buf.readUInt32BE(e + 4);
    const compLength = buf.readUInt32BE(e + 8);
    const origLength = buf.readUInt32BE(e + 12);
    const checksum = buf.readUInt32BE(e + 16);
    const raw = buf.subarray(tableOffset, tableOffset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : raw;
    const h = 12 + i * 16;
    header.writeUInt32BE(tag, h);
    header.writeUInt32BE(checksum, h + 4);
    header.writeUInt32BE(offset, h + 8);
    header.writeUInt32BE(origLength, h + 12);
    const pad = (4 - (data.length % 4)) % 4;
    parts.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
  }
  return Buffer.concat(parts);
}

const FONTS = {
  karantinaHe: ['karantina', 'karantina-hebrew-700-normal.woff'],
  karantinaLatin: ['karantina', 'karantina-latin-700-normal.woff'],
  heeboHe: ['heebo', 'heebo-hebrew-500-normal.woff'],
  plexHe: ['ibm-plex-sans-hebrew', 'ibm-plex-sans-hebrew-hebrew-700-normal.woff'],
  plexHe500: ['ibm-plex-sans-hebrew', 'ibm-plex-sans-hebrew-hebrew-500-normal.woff'],
  plexLatin: ['ibm-plex-sans-hebrew', 'ibm-plex-sans-hebrew-latin-700-normal.woff'],
} as const;
type FontKey = keyof typeof FONTS;

const fontCache = new Map<FontKey, string>();
function fontFile(key: FontKey): string {
  const hit = fontCache.get(key);
  if (hit) return hit;
  const [pkg, file] = FONTS[key];
  const dir = path.join(tmpdir(), 'amdir-og-fonts');
  const out = path.join(dir, file.replace(/\.woff$/, '.ttf'));
  if (!existsSync(out)) {
    mkdirSync(dir, { recursive: true });
    const src = path.join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files', file);
    writeFileSync(out, woffToSfnt(readFileSync(src)));
  }
  fontCache.set(key, out);
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function textLayer(opts: { text: string; font: FontKey; family: string; size: number; color: string; width?: number }) {
  const { data, info } = await sharp({
    text: {
      // RLM forces an RTL paragraph even when the text starts with Latin ("Event Pro Studio ...").
      // Pango swaps left/right alignment for RTL paragraphs, so 'left' here means visual right.
      text: `<span foreground="${opts.color}">‏${esc(opts.text)}</span>`,
      font: `${opts.family} ${opts.size}`,
      fontfile: fontFile(opts.font),
      rgba: true,
      dpi: 72,
      align: 'left',
      wrap: 'word',
      ...(opts.width ? { width: opts.width } : {}),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

interface Theme {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  titleFont: FontKey;
  titleFamily: string;
  brandFont: FontKey;
  brandFamily: string;
  kickerFont: FontKey;
  kickerFamily: string;
  titleSizes: number[];
  backdrop?: string;
}

const THEMES: Record<Direction, Theme> = {
  stage: {
    bg: '#131417',
    fg: '#ece8e1',
    muted: '#a8a39b',
    accent: '#d6286f',
    titleFont: 'karantinaHe',
    titleFamily: 'Karantina Bold',
    brandFont: 'karantinaLatin',
    brandFamily: 'Karantina Bold',
    kickerFont: 'heeboHe',
    kickerFamily: 'Heebo Medium',
    titleSizes: [190, 160, 130, 110],
    backdrop: 'public/og-default.png',
  },
  index: {
    bg: '#f1f3f5',
    fg: '#0e1b2c',
    muted: '#4f5e72',
    accent: '#c2410c',
    titleFont: 'plexHe',
    titleFamily: 'IBM Plex Sans Hebrew Bold',
    brandFont: 'plexLatin',
    brandFamily: 'IBM Plex Sans Hebrew Bold',
    kickerFont: 'plexHe500',
    kickerFamily: 'IBM Plex Sans Hebrew Medium',
    titleSizes: [104, 88, 74, 62],
  },
};

export interface OgCard {
  /** Main line, Hebrew. */
  title: string;
  /** Small line above the title, Hebrew only (the Hebrew font subsets carry no Latin). */
  kicker: string;
  /** Latin brand mark, e.g. "AMDIR". */
  brand: string;
  direction: Direction;
}

const MARGIN = 80;
const TEXT_WIDTH = OG_WIDTH - MARGIN * 2;
const MAX_TITLE_HEIGHT = 330;

let warmed: Promise<void> | undefined;
/**
 * Register every font file with fontconfig before the first real layout, so mixed Hebrew/Latin
 * text falls back to our own Latin faces regardless of render order (and never to system fonts,
 * which a build machine may not have).
 */
function warmFonts(): Promise<void> {
  warmed ??= (async () => {
    for (const key of Object.keys(FONTS) as FontKey[]) {
      await sharp({ text: { text: 'א', fontfile: fontFile(key), rgba: true } }).png().toBuffer();
    }
  })();
  return warmed;
}

/** Render one branded card. Right-aligned (RTL): brand top-right, kicker + title bottom-right. */
export async function renderOgCard(card: OgCard): Promise<Buffer> {
  await warmFonts();
  const t = THEMES[card.direction];
  let title = await textLayer({ text: card.title, font: t.titleFont, family: t.titleFamily, size: t.titleSizes[0] ?? 120, color: t.fg, width: TEXT_WIDTH });
  for (const size of t.titleSizes.slice(1)) {
    if (title.height <= MAX_TITLE_HEIGHT && title.width <= TEXT_WIDTH) break;
    title = await textLayer({ text: card.title, font: t.titleFont, family: t.titleFamily, size, color: t.fg, width: TEXT_WIDTH });
  }
  const kicker = await textLayer({ text: card.kicker, font: t.kickerFont, family: t.kickerFamily, size: 34, color: t.muted, width: TEXT_WIDTH });
  const brand = await textLayer({ text: card.brand, font: t.brandFont, family: t.brandFamily, size: card.direction === 'stage' ? 64 : 40, color: t.fg });

  const layers: OverlayOptions[] = [];
  let base: Sharp;
  if (t.backdrop && existsSync(path.join(process.cwd(), t.backdrop))) {
    base = sharp(path.join(process.cwd(), t.backdrop)).resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' });
    // Darken the text side (right, RTL start) so the title keeps contrast over the light beams.
    const shade = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}"><defs><linearGradient id="g" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${t.bg}" stop-opacity="0.94"/><stop offset="0.55" stop-color="${t.bg}" stop-opacity="0.8"/><stop offset="1" stop-color="${t.bg}" stop-opacity="0.35"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    layers.push({ input: Buffer.from(shade), top: 0, left: 0 });
  } else {
    base = sharp({ create: { width: OG_WIDTH, height: OG_HEIGHT, channels: 4, background: t.bg } });
  }
  const right = (w: number) => Math.max(MARGIN, OG_WIDTH - MARGIN - w);
  const bar = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="8"><rect width="96" height="8" fill="${t.accent}"/></svg>`;
  const titleTop = OG_HEIGHT - MARGIN - title.height;
  const kickerTop = titleTop - kicker.height - 22;
  layers.push(
    { input: brand.data, top: MARGIN - 10, left: right(brand.width) },
    { input: Buffer.from(bar), top: MARGIN + brand.height + 6, left: OG_WIDTH - MARGIN - 96 },
    { input: kicker.data, top: Math.max(MARGIN + brand.height + 40, kickerTop), left: right(kicker.width) },
    { input: title.data, top: Math.max(MARGIN + brand.height + 40, titleTop), left: right(title.width) },
  );
  return base.composite(layers).png({ compressionLevel: 9, palette: card.direction === 'index' }).toBuffer();
}
