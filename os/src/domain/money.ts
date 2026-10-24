/**
 * Money. Every amount in Studio OS is an integer number of agorot (1 ₪ = 100 agorot).
 * No floating-point amounts are ever stored or summed.
 *
 * Rounding rules (explicit, all tested in money.test.ts):
 *  R1. Line net = quantity × unit price. Quantity has at most 2 decimals; the product is rounded
 *      to the nearest agora, half away from zero.
 *  R2. VAT is computed ONCE, on the document net total after discount (never per line and summed),
 *      rounded to the nearest agora, half away from zero.
 *  R3. Total = net + VAT, exactly (no further rounding).
 *  R4. When a price is given including VAT (gross), net = round(gross ÷ (1 + rate)), and
 *      VAT = gross − net, so net + VAT always equals the gross the person typed.
 */

export type Agorot = number;

/** Basis points: 1800 = 18%. */
export type BasisPoints = number;

export interface VatRatePeriod {
  /** Inclusive start date, ISO yyyy-mm-dd. */
  readonly from: string;
  readonly rate: BasisPoints;
}

/** Israeli standard VAT rate history, newest first. 18% since 1 January 2025. */
export const VAT_RATES: readonly VatRatePeriod[] = [
  { from: '2025-01-01', rate: 1800 },
  { from: '2015-10-01', rate: 1700 },
];

export const CURRENT_VAT_RATE: BasisPoints = 1800;

export function isAgorot(value: unknown): value is Agorot {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertAgorot(value: number, what = 'amount'): Agorot {
  if (!isAgorot(value)) throw new RangeError(`${what} must be an integer number of agorot, got ${String(value)}`);
  return value;
}

/** Integer division of a/b rounded to nearest, half away from zero. b must be a positive integer. */
export function divRoundHalfAwayFromZero(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b <= 0) {
    throw new RangeError('divRoundHalfAwayFromZero expects safe integers and a positive divisor');
  }
  const sign = a < 0 ? -1 : 1;
  const abs = Math.abs(a);
  const q = Math.floor(abs / b);
  const r = abs - q * b;
  const rounded = r * 2 >= b ? q + 1 : q;
  return rounded === 0 ? 0 : sign * rounded; // never -0
}

/** VAT rate in force on a given ISO date (yyyy-mm-dd or full ISO timestamp). */
export function vatRateOn(date: string): BasisPoints {
  const day = date.slice(0, 10);
  for (const period of VAT_RATES) {
    if (day >= period.from) return period.rate;
  }
  throw new RangeError(`No VAT rate known for ${day}`);
}

/** R2: VAT on a net amount. */
export function vatOf(net: Agorot, rate: BasisPoints = CURRENT_VAT_RATE): Agorot {
  assertAgorot(net, 'net');
  return divRoundHalfAwayFromZero(net * rate, 10_000);
}

/** R4: split a VAT-inclusive (gross) amount into net and VAT. */
export function splitGross(gross: Agorot, rate: BasisPoints = CURRENT_VAT_RATE): { net: Agorot; vat: Agorot } {
  assertAgorot(gross, 'gross');
  const net = divRoundHalfAwayFromZero(gross * 10_000, 10_000 + rate);
  return { net, vat: gross - net };
}

/** Quantity stored as hundredths so 1.5 hours is exact. */
export function quantityToHundredths(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity < 0) throw new RangeError('quantity must be a non-negative number');
  const hundredths = Math.round(quantity * 100);
  if (Math.abs(hundredths - quantity * 100) > 1e-6) throw new RangeError('quantity may have at most 2 decimals');
  return hundredths;
}

/** R1. */
export function lineNet(quantity: number, unitPrice: Agorot): Agorot {
  assertAgorot(unitPrice, 'unit price');
  return divRoundHalfAwayFromZero(quantityToHundredths(quantity) * unitPrice, 100);
}

const ILS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ILS_WHOLE = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** "‏1,234.50 ₪". Whole shekels drop the ".00" when `compact` is set. */
export function formatAgorot(amount: Agorot, opts: { compact?: boolean } = {}): string {
  assertAgorot(amount);
  if (opts.compact && amount % 100 === 0) return ILS_WHOLE.format(amount / 100);
  // Format from integer parts so floats never leak into display.
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  return ILS.format(sign * (Math.floor(abs / 100) + (abs % 100) / 100));
}

/**
 * Parse what a person types in a shekel field into agorot.
 * Accepts "1500", "1,500", "1500.5", "1,500.50", "₪1500", " 1500 ₪ ". Rejects more than 2 decimals,
 * negatives and anything else. Returns null for invalid input.
 */
export function parseShekels(input: string): Agorot | null {
  const cleaned = input.replace(/[₪\s‎‏]/g, '');
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.replace(/,/g, '').split('.');
  const agorot = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(agorot) ? agorot : null;
}

/** Agorot to an editable shekel string: 150050 → "1500.50", 150000 → "1500". */
export function agorotToInput(amount: Agorot): string {
  assertAgorot(amount);
  const whole = Math.trunc(amount / 100);
  const frac = Math.abs(amount % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

export function sumAgorot(values: readonly Agorot[]): Agorot {
  return values.reduce((acc, v) => acc + assertAgorot(v), 0);
}
