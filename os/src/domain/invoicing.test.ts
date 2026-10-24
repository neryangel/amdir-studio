import { describe, expect, it } from 'vitest';
import { ALLOCATION_STATUS_LABEL, allocationRequirement, allocationRuleOn } from './invoicing';

describe('allocation number requirement (מספר הקצאה)', () => {
  it('requires it for tax invoices at exactly ₪5,000 net from 1.6.2026', () => {
    expect(allocationRequirement({ docType: 'tax-invoice', net: 500_000, issueDate: '2026-06-01', toBusiness: true })).toEqual({
      required: true,
      reason: 'at-or-above-threshold',
      threshold: 500_000,
    });
  });
  it('does not require it one agora below the threshold', () => {
    expect(allocationRequirement({ docType: 'tax-invoice', net: 499_999, issueDate: '2026-10-24', toBusiness: true }).required).toBe(false);
    expect(allocationRequirement({ docType: 'tax-invoice', net: 499_999, issueDate: '2026-10-24', toBusiness: true }).reason).toBe('below-threshold');
  });
  it('uses the net before VAT: ₪4,999 + VAT (gross ₪5,898.82) is still below', () => {
    expect(allocationRequirement({ docType: 'tax-invoice-receipt', net: 499_900, issueDate: '2026-10-24', toBusiness: true }).required).toBe(false);
  });
  it('applies to tax-invoice-receipt too', () => {
    expect(allocationRequirement({ docType: 'tax-invoice-receipt', net: 800_000, issueDate: '2026-07-01', toBusiness: true }).required).toBe(true);
  });
  it('never applies to receipts or quotes', () => {
    expect(allocationRequirement({ docType: 'receipt', net: 9_000_000, issueDate: '2026-10-24', toBusiness: true }).reason).toBe('doc-type-exempt');
    expect(allocationRequirement({ docType: 'quote', net: 9_000_000, issueDate: '2026-10-24', toBusiness: true }).required).toBe(false);
  });
  it('dates before the rule table are out of scope, not silently "required"', () => {
    expect(allocationRequirement({ docType: 'tax-invoice', net: 9_000_000, issueDate: '2026-05-31', toBusiness: true })).toEqual({
      required: false,
      reason: 'before-rule-table',
      threshold: null,
    });
    expect(allocationRuleOn('2026-05-31')).toBeNull();
    expect(allocationRuleOn('2026-06-01T08:00:00Z')?.minNet).toBe(500_000);
  });
  it('private customers never need one', () => {
    expect(allocationRequirement({ docType: 'tax-invoice', net: 9_000_000, issueDate: '2026-10-24', toBusiness: false })).toEqual({
      required: false,
      reason: 'private-customer',
      threshold: null,
    });
  });
  it('labels every status in Hebrew', () => {
    for (const label of Object.values(ALLOCATION_STATUS_LABEL)) expect(label).toMatch(/[֐-׿]/);
  });
});
