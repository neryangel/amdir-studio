import { describe, expect, it } from 'vitest';
import {
  CURRENT_VAT_RATE,
  agorotToInput,
  assertAgorot,
  divRoundHalfAwayFromZero,
  formatAgorot,
  isAgorot,
  lineNet,
  parseShekels,
  quantityToHundredths,
  splitGross,
  sumAgorot,
  vatOf,
  vatRateOn,
} from './money';

const digits = (s: string) => s.replace(/[^\d.,-]/g, '');

describe('agorot integers', () => {
  it('accepts safe integers only', () => {
    expect(isAgorot(100)).toBe(true);
    expect(isAgorot(0)).toBe(true);
    expect(isAgorot(-5)).toBe(true);
    expect(isAgorot(1.5)).toBe(false);
    expect(isAgorot(Number.NaN)).toBe(false);
    expect(isAgorot('100')).toBe(false);
    expect(isAgorot(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
  });
  it('assertAgorot throws on floats with a useful message', () => {
    expect(() => assertAgorot(10.5, 'price')).toThrow(/price must be an integer number of agorot/);
    expect(assertAgorot(1050)).toBe(1050);
  });
  it('sumAgorot rejects floats and sums exactly', () => {
    expect(sumAgorot([10, 20, 30])).toBe(60);
    expect(sumAgorot([])).toBe(0);
    expect(() => sumAgorot([10, 0.1])).toThrow(RangeError);
  });
});

describe('divRoundHalfAwayFromZero', () => {
  it.each([
    [5, 10, 1],
    [4, 10, 0],
    [15, 10, 2],
    [14, 10, 1],
    [-5, 10, -1],
    [-4, 10, 0],
    [-15, 10, -2],
    [0, 7, 0],
    [7, 7, 1],
  ])('%i / %i → %i', (a, b, expected) => {
    expect(divRoundHalfAwayFromZero(a, b)).toBe(expected);
  });
  it('rejects zero/negative divisors and non-integers', () => {
    expect(() => divRoundHalfAwayFromZero(1, 0)).toThrow(RangeError);
    expect(() => divRoundHalfAwayFromZero(1, -2)).toThrow(RangeError);
    expect(() => divRoundHalfAwayFromZero(1.5, 2)).toThrow(RangeError);
  });
});

describe('VAT rate', () => {
  it('is 18% from 1 January 2025', () => {
    expect(CURRENT_VAT_RATE).toBe(1800);
    expect(vatRateOn('2025-01-01')).toBe(1800);
    expect(vatRateOn('2026-10-24T09:00:00.000Z')).toBe(1800);
  });
  it('was 17% before 2025', () => {
    expect(vatRateOn('2024-12-31')).toBe(1700);
    expect(vatRateOn('2016-06-01')).toBe(1700);
  });
  it('throws for dates before the known table', () => {
    expect(() => vatRateOn('2000-01-01')).toThrow(RangeError);
  });
});

describe('vatOf (R2: once on the net, half away from zero)', () => {
  it('computes 18% exactly on round amounts', () => {
    expect(vatOf(100_000)).toBe(18_000); // ₪1,000 → ₪180
    expect(vatOf(500_000)).toBe(90_000);
  });
  it('rounds half up to the nearest agora', () => {
    // 25 agorot × 18% = 4.5 → 5
    expect(vatOf(25)).toBe(5);
    // 24 × 18% = 4.32 → 4
    expect(vatOf(24)).toBe(4);
    // 1 × 18% = 0.18 → 0
    expect(vatOf(1)).toBe(0);
    // 3 × 18% = 0.54 → 1
    expect(vatOf(3)).toBe(1);
  });
  it('respects an explicit rate', () => {
    expect(vatOf(100_000, 1700)).toBe(17_000);
    expect(vatOf(100_000, 0)).toBe(0);
  });
  it('handles negative nets (credit notes) symmetrically', () => {
    expect(vatOf(-25)).toBe(-5);
  });
  it('refuses float input', () => {
    expect(() => vatOf(10.5)).toThrow(RangeError);
  });
  it('per-document VAT differs from per-line VAT, and the document rule wins', () => {
    // Three lines of 25 agorot: per-line 5+5+5 = 15; on the total 75 × 18% = 13.5 → 14.
    expect(vatOf(75)).toBe(14);
  });
});

describe('splitGross (R4)', () => {
  it('splits a VAT-inclusive price so net + vat equals the gross', () => {
    const { net, vat } = splitGross(118_000);
    expect(net).toBe(100_000);
    expect(vat).toBe(18_000);
  });
  it.each([1, 99, 1_000, 59_000, 123_457, 999_999])('net + vat === gross for %i', (gross) => {
    const { net, vat } = splitGross(gross);
    expect(net + vat).toBe(gross);
    expect(Number.isInteger(net) && Number.isInteger(vat)).toBe(true);
  });
  it('rounds the net to the nearest agora', () => {
    // 100 / 1.18 = 84.745… → 85, vat 15
    expect(splitGross(100)).toEqual({ net: 85, vat: 15 });
  });
});

describe('quantity and line net (R1)', () => {
  it('stores quantity in hundredths', () => {
    expect(quantityToHundredths(1)).toBe(100);
    expect(quantityToHundredths(1.5)).toBe(150);
    expect(quantityToHundredths(0.01)).toBe(1);
    expect(quantityToHundredths(2.35)).toBe(235);
  });
  it('rejects more than 2 decimals and negatives', () => {
    expect(() => quantityToHundredths(1.234)).toThrow(/at most 2 decimals/);
    expect(() => quantityToHundredths(-1)).toThrow(RangeError);
    expect(() => quantityToHundredths(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
  it('multiplies exactly and rounds half up', () => {
    expect(lineNet(2, 350_000)).toBe(700_000);
    expect(lineNet(1.5, 280_000)).toBe(420_000);
    // 0.33 × 101 = 33.33 → 33
    expect(lineNet(0.33, 101)).toBe(33);
    // 0.5 × 101 = 50.5 → 51
    expect(lineNet(0.5, 101)).toBe(51);
    expect(lineNet(0, 999)).toBe(0);
  });
  it('rejects float unit prices', () => {
    expect(() => lineNet(1, 10.5)).toThrow(RangeError);
  });
});

describe('parseShekels / agorotToInput', () => {
  it.each([
    ['1500', 150_000],
    ['1,500', 150_000],
    ['1500.5', 150_050],
    ['1,500.50', 150_050],
    ['₪1500', 150_000],
    [' 1500 ₪ ', 150_000],
    ['0', 0],
    ['0.01', 1],
    ['12,345,678.90', 1_234_567_890],
  ])('parses %j → %i', (input, expected) => {
    expect(parseShekels(input)).toBe(expected);
  });
  it.each(['', 'abc', '-5', '1.234', '1,50', '12,34,567', '1.', '.5', '1e3'])('rejects %j', (input) => {
    expect(parseShekels(input)).toBeNull();
  });
  it('round-trips through agorotToInput', () => {
    for (const a of [0, 1, 99, 100, 150_050, 150_000, 1_234_567_890]) {
      expect(parseShekels(agorotToInput(a))).toBe(a);
    }
    expect(agorotToInput(150_000)).toBe('1500');
    expect(agorotToInput(150_005)).toBe('1500.05');
  });
});

describe('formatAgorot', () => {
  it('formats with two decimals and the shekel sign', () => {
    const s = formatAgorot(123_450);
    expect(s).toContain('₪');
    expect(digits(s)).toBe('1,234.50');
  });
  it('compact drops .00 for whole shekels only', () => {
    expect(digits(formatAgorot(150_000, { compact: true }))).toBe('1,500');
    expect(digits(formatAgorot(150_050, { compact: true }))).toBe('1,500.50');
  });
  it('formats negatives and zero', () => {
    expect(digits(formatAgorot(0))).toBe('0.00');
    expect(digits(formatAgorot(-1_005))).toBe('-10.05');
  });
});
