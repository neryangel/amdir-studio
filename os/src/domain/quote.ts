import { type Agorot, lineNet, sumAgorot, vatOf } from './money';
import type { Quote, QuoteLine } from './types';

export interface QuoteTotals {
  /** Sum of line nets (R1 per line). */
  readonly subtotal: Agorot;
  /** Discount actually applied (clamped to 0..subtotal). */
  readonly discount: Agorot;
  /** Net after discount: the VAT base and the amount checked against the allocation-number threshold. */
  readonly net: Agorot;
  readonly vat: Agorot;
  /** net + vat: what the client pays ("כולל מע״מ"). */
  readonly total: Agorot;
  readonly vatRate: number;
}

export function computeQuoteTotals(
  lines: readonly Pick<QuoteLine, 'quantity' | 'unitPrice'>[],
  discount: Agorot,
  vatRate: number,
): QuoteTotals {
  const subtotal = sumAgorot(lines.map((l) => lineNet(l.quantity, l.unitPrice)));
  const applied = Math.min(Math.max(0, Math.trunc(discount)), subtotal);
  const net = subtotal - applied;
  const vat = vatOf(net, vatRate);
  return { subtotal, discount: applied, net, vat, total: net + vat, vatRate };
}

export function quoteTotals(quote: Pick<Quote, 'lines' | 'discount' | 'vatRate'>): QuoteTotals {
  return computeQuoteTotals(quote.lines, quote.discount, quote.vatRate);
}

/** Remaining gross amount the client owes on an accepted quote. Never negative. */
export function balanceDue(quote: Pick<Quote, 'lines' | 'discount' | 'vatRate' | 'paid' | 'status'>): Agorot {
  if (quote.status !== 'accepted') return 0;
  return Math.max(0, quoteTotals(quote).total - quote.paid);
}

export type PaymentState = 'not-due' | 'unpaid' | 'partial' | 'paid';

export function paymentState(quote: Pick<Quote, 'lines' | 'discount' | 'vatRate' | 'paid' | 'status'>): PaymentState {
  if (quote.status !== 'accepted') return 'not-due';
  const { total } = quoteTotals(quote);
  if (quote.paid <= 0) return total === 0 ? 'paid' : 'unpaid';
  return quote.paid >= total ? 'paid' : 'partial';
}

export interface QuoteIssue {
  readonly field: 'lines' | 'description' | 'quantity' | 'unitPrice' | 'discount';
  readonly lineId?: string;
  readonly message: string;
}

/** Validation for sending a quote. A draft may be incomplete; a sent quote may not. */
export function validateQuoteForSending(quote: Pick<Quote, 'lines' | 'discount' | 'vatRate'>): QuoteIssue[] {
  const issues: QuoteIssue[] = [];
  if (quote.lines.length === 0) issues.push({ field: 'lines', message: 'צריך לפחות שורה אחת בהצעה.' });
  for (const line of quote.lines) {
    if (!line.description.trim()) issues.push({ field: 'description', lineId: line.id, message: 'לשורה חסר תיאור.' });
    if (!(line.quantity > 0)) issues.push({ field: 'quantity', lineId: line.id, message: 'הכמות צריכה להיות גדולה מאפס.' });
    if (line.unitPrice < 0) issues.push({ field: 'unitPrice', lineId: line.id, message: 'מחיר לא יכול להיות שלילי.' });
  }
  const { subtotal } = quoteTotals(quote);
  if (quote.discount < 0) issues.push({ field: 'discount', message: 'הנחה לא יכולה להיות שלילית.' });
  else if (quote.discount > subtotal) issues.push({ field: 'discount', message: 'ההנחה גדולה מסכום ההצעה.' });
  return issues;
}

export const QUOTE_STATUS_LABEL: Record<Quote['status'], string> = {
  draft: 'טיוטה',
  sent: 'נשלחה',
  accepted: 'אושרה',
  declined: 'נדחתה',
};

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  'not-due': 'לא לתשלום עדיין',
  unpaid: 'לא שולם',
  partial: 'שולם חלקית',
  paid: 'שולם',
};

/** Allowed quote status transitions. */
export function canChangeQuoteStatus(from: Quote['status'], to: Quote['status']): boolean {
  const map: Record<Quote['status'], readonly Quote['status'][]> = {
    draft: ['sent'],
    sent: ['accepted', 'declined', 'draft'],
    accepted: [],
    declined: ['draft'],
  };
  return map[from].includes(to);
}
