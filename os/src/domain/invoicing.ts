import type { Agorot } from './money';
import type { AllocationStatus, IsoDate } from './types';

/**
 * Israeli tax invoices and the allocation number (מספר הקצאה).
 *
 * Under the "Israel Invoices" model, a tax invoice issued to a business (a VAT-registered customer
 * that will deduct input VAT) at or above a net (before VAT) threshold needs an allocation number from the Tax Authority, obtained by the invoicing system.
 * Studio OS only models the REQUIREMENT as a flag/status; obtaining the number is the
 * InvoicingProvider's job (mock today, a licensed provider later, chosen by the owner).
 *
 * Rule table (verify with the accountant before going live):
 *  - from 2026-06-01: tax invoices with net ≥ ₪5,000 require an allocation number.
 * Dates before the first row are out of scope for Studio OS (the system starts after it).
 */
export interface AllocationRule {
  readonly from: IsoDate;
  /** Inclusive threshold on the net amount before VAT. */
  readonly minNet: Agorot;
}

export const ALLOCATION_RULES: readonly AllocationRule[] = [{ from: '2026-06-01', minNet: 500_000 }];

export type InvoiceDocType = 'tax-invoice' | 'tax-invoice-receipt' | 'receipt' | 'quote';

export interface AllocationRequirement {
  readonly required: boolean;
  readonly reason: 'doc-type-exempt' | 'private-customer' | 'below-threshold' | 'at-or-above-threshold' | 'before-rule-table';
  readonly threshold: Agorot | null;
}

export function allocationRuleOn(date: IsoDate): AllocationRule | null {
  const day = date.slice(0, 10);
  let match: AllocationRule | null = null;
  for (const rule of ALLOCATION_RULES) if (day >= rule.from && (!match || rule.from > match.from)) match = rule;
  return match;
}

export function allocationRequirement(input: {
  docType: InvoiceDocType;
  net: Agorot;
  issueDate: IsoDate;
  /** Customer is a VAT-registered business. Private customers never need an allocation number. */
  toBusiness: boolean;
}): AllocationRequirement {
  if (input.docType !== 'tax-invoice' && input.docType !== 'tax-invoice-receipt') {
    return { required: false, reason: 'doc-type-exempt', threshold: null };
  }
  if (!input.toBusiness) return { required: false, reason: 'private-customer', threshold: null };
  const rule = allocationRuleOn(input.issueDate);
  if (!rule) return { required: false, reason: 'before-rule-table', threshold: null };
  return input.net >= rule.minNet
    ? { required: true, reason: 'at-or-above-threshold', threshold: rule.minNet }
    : { required: false, reason: 'below-threshold', threshold: rule.minNet };
}

export const ALLOCATION_STATUS_LABEL: Record<AllocationStatus, string> = {
  'not-required': 'לא נדרש מספר הקצאה',
  required: 'נדרש מספר הקצאה',
  pending: 'ממתין למספר הקצאה',
  granted: 'התקבל מספר הקצאה',
  rejected: 'בקשת ההקצאה נדחתה',
};
