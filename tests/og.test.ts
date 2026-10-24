import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { OG_HEIGHT, OG_WIDTH, ogKey, ogPath } from '../src/lib/og';
import { renderOgCard, woffToSfnt } from '../src/lib/og-render';

describe('ogKey', () => {
  it('maps paths to stable file keys', () => {
    expect(ogKey('/')).toBe('home');
    expect(ogKey('')).toBe('home');
    expect(ogKey('/process/')).toBe('process');
    expect(ogKey('/services/clips/')).toBe('services-clips');
    expect(ogKey('/products/Event Pro/')).toBe('products-event-pro');
    expect(ogPath('/faq/')).toBe('/og/faq.png');
  });
});

describe('woffToSfnt', () => {
  it('unpacks a WOFF 1.0 font into a TrueType file with the same tables', () => {
    const woff = readFileSync(path.join(process.cwd(), 'node_modules/@fontsource/heebo/files/heebo-hebrew-500-normal.woff'));
    const ttf = woffToSfnt(woff);
    expect(ttf.readUInt32BE(0)).toBe(woff.readUInt32BE(4)); // sfnt flavor
    expect(ttf.readUInt16BE(4)).toBe(woff.readUInt16BE(12)); // numTables
    expect(ttf.length % 4).toBe(0);
  });

  it('rejects anything that is not WOFF 1.0', () => {
    expect(() => woffToSfnt(Buffer.from('wOF2xxxxxxxxxxxx'))).toThrow(/WOFF/);
  });
});

describe('renderOgCard', () => {
  it.each(['stage', 'index'] as const)('renders a %s card at 1200x630 PNG, including mixed Hebrew/Latin', async (direction) => {
    const png = await renderOgCard({ title: 'Event Pro Studio מערכת לצלמים', kicker: 'מוצר של AMDIR', brand: 'AMDIR', direction });
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect([meta.width, meta.height]).toEqual([OG_WIDTH, OG_HEIGHT]);
  }, 20_000);
});
