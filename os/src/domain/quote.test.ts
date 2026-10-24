import { describe, expect, it } from 'vitest';
import { balanceDue, canChangeQuoteStatus, computeQuoteTotals, paymentState, quoteTotals, validateQuoteForSending } from './quote';
import type { Quote, QuoteLine } from './types';

const line = (id: string, quantity: number, unitPrice: number, description = 'שורה'): QuoteLine => ({ id, quantity, unitPrice, description });

function quote(partial: Partial<Quote> = {}): Quote {
  return {
    id: 'q1',
    demo: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    projectId: 'p1',
    clientId: 'c1',
    number: 'Q-1',
    title: 'הצעה',
    lines: [line('a', 1, 1_000_000)],
    discount: 0,
    vatRate: 1800,
    status: 'draft',
    issuedOn: '2026-10-01',
    validUntil: null,
    sentAt: null,
    acceptedAt: null,
    paid: 0,
    paymentLinkId: null,
    invoice: null,
    ...partial,
  };
}

describe('computeQuoteTotals', () => {
  it('sums lines, applies VAT once and totals exactly', () => {
    const t = computeQuoteTotals([line('a', 2, 350_000), line('b', 1.5, 120_000)], 0, 1800);
    expect(t.subtotal).toBe(880_000);
    expect(t.net).toBe(880_000);
    expect(t.vat).toBe(158_400);
    expect(t.total).toBe(1_038_400);
    expect(t.total).toBe(t.net + t.vat);
  });
  it('applies the discount before VAT', () => {
    const t = computeQuoteTotals([line('a', 1, 1_000_000)], 100_000, 1800);
    expect(t.net).toBe(900_000);
    expect(t.vat).toBe(162_000);
    expect(t.total).toBe(1_062_000);
  });
  it('clamps the discount to 0..subtotal and truncates fractions', () => {
    expect(computeQuoteTotals([line('a', 1, 1_000)], 5_000, 1800).net).toBe(0);
    expect(computeQuoteTotals([line('a', 1, 1_000)], -500, 1800).discount).toBe(0);
    expect(computeQuoteTotals([line('a', 1, 1_000)], 10.9, 1800).discount).toBe(10);
  });
  it('computes VAT on the document, not per line', () => {
    const t = computeQuoteTotals([line('a', 1, 25), line('b', 1, 25), line('c', 1, 25)], 0, 1800);
    expect(t.vat).toBe(14); // per line it would be 15
  });
  it('empty quote totals zero', () => {
    expect(computeQuoteTotals([], 0, 1800)).toEqual({ subtotal: 0, discount: 0, net: 0, vat: 0, total: 0, vatRate: 1800 });
  });
  it('uses the quote VAT rate', () => {
    expect(quoteTotals(quote({ vatRate: 1700 })).vat).toBe(170_000);
  });
});

describe('payment state and balance', () => {
  it('nothing is due before acceptance', () => {
    expect(balanceDue(quote({ status: 'sent' }))).toBe(0);
    expect(paymentState(quote({ status: 'sent' }))).toBe('not-due');
  });
  it('accepted, unpaid, partial, paid', () => {
    const accepted = quote({ status: 'accepted' });
    expect(balanceDue(accepted)).toBe(1_180_000);
    expect(paymentState(accepted)).toBe('unpaid');
    expect(paymentState({ ...accepted, paid: 500_000 })).toBe('partial');
    expect(balanceDue({ ...accepted, paid: 500_000 })).toBe(680_000);
    expect(paymentState({ ...accepted, paid: 1_180_000 })).toBe('paid');
    expect(balanceDue({ ...accepted, paid: 2_000_000 })).toBe(0);
  });
  it('a zero-total accepted quote counts as paid', () => {
    expect(paymentState(quote({ status: 'accepted', lines: [] }))).toBe('paid');
  });
});

describe('validateQuoteForSending', () => {
  it('passes a complete quote', () => {
    expect(validateQuoteForSending(quote())).toEqual([]);
  });
  it('flags empty quotes, missing descriptions, zero quantities and excessive discounts', () => {
    expect(validateQuoteForSending(quote({ lines: [] })).map((i) => i.field)).toContain('lines');
    const issues = validateQuoteForSending(quote({ lines: [line('x', 0, 100, '  ')], discount: 1_000 }));
    expect(issues.map((i) => i.field).sort()).toEqual(['description', 'discount', 'quantity']);
    expect(issues.find((i) => i.field === 'description')?.lineId).toBe('x');
  });
  it('flags negative prices and discounts', () => {
    const issues = validateQuoteForSending(quote({ lines: [line('x', 1, -1)], discount: -1 }));
    expect(issues.map((i) => i.field).sort()).toEqual(['discount', 'unitPrice']);
  });
});

describe('quote status transitions', () => {
  it.each([
    ['draft', 'sent', true],
    ['draft', 'accepted', false],
    ['sent', 'accepted', true],
    ['sent', 'declined', true],
    ['sent', 'draft', true],
    ['accepted', 'draft', false],
    ['accepted', 'declined', false],
    ['declined', 'draft', true],
  ] as const)('%s → %s: %s', (from, to, ok) => {
    expect(canChangeQuoteStatus(from, to)).toBe(ok);
  });
});
