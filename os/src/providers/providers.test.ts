import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../data/storage';
import {
  describeEmailContract,
  describeInvoicingContract,
  describePaymentContract,
  describeStorageContract,
  describeVideoHostContract,
} from './contracts';
import {
  createMockEmailProvider,
  createMockInvoicingProvider,
  createMockPaymentProvider,
  createMockProviders,
  createMockStorageProvider,
  createMockVideoHostProvider,
} from './mocks';
import { OUTBOX_KEY, createOutbox } from './outbox';

const outbox = () => createOutbox({ storage: createMemoryStorage() });

// Every mock passes the same contract a real adapter must pass.
describeEmailContract('mock', () => createMockEmailProvider({ outbox: outbox() }));
describeStorageContract('mock', () => createMockStorageProvider({ outbox: outbox() }));
describeVideoHostContract('mock', () => createMockVideoHostProvider({ outbox: outbox() }));
describePaymentContract('mock', () => createMockPaymentProvider({ outbox: outbox() }));
describeInvoicingContract('mock', () => createMockInvoicingProvider({ outbox: outbox() }));

describe('mock providers write to the outbox and never to the network', () => {
  it('records each call with a Hebrew summary and the exact payload', async () => {
    const ob = outbox();
    const p = createMockProviders({ outbox: ob, seq: (() => { let n = 0; return () => (n += 1); })() });
    await p.email.send({ to: 'a@example.invalid', subject: 'הצעת מחיר', text: 'שלום', tag: 'quote-sent' });
    await p.payment.createPaymentLink({ reference: 'Q-1', amount: 118_000, description: 'x', customerEmail: null });
    await p.invoicing.issue({ docType: 'tax-invoice', reference: 'Q-1', customerName: 'x', customerTaxId: '000000000', net: 600_000, vat: 108_000, issueDate: '2026-10-24' });
    const entries = ob.list();
    expect(entries.map((e) => e.provider)).toEqual(['invoicing', 'payment', 'email']);
    expect(entries[2]?.payload).toMatchObject({ to: 'a@example.invalid', subject: 'הצעת מחיר', tag: 'quote-sent' });
    for (const e of entries) expect(e.summary).toMatch(/[֐-׿]/);
    expect(entries[0]?.payload['allocationStatus']).toBe('granted');
    expect(entries[0]?.payload['allocationNumber']).toMatch(/^DEMO-ALLOC-\d{9}$/);
  });
  it('mock URLs use the reserved .invalid TLD', async () => {
    const p = createMockProviders({ outbox: outbox() });
    const link = await p.payment.createPaymentLink({ reference: 'Q', amount: 1, description: '', customerEmail: null });
    const up = await p.video.createUpload({ title: 'v', sizeBytes: 1 });
    expect(new URL(link.url).hostname.endsWith('.invalid')).toBe(true);
    expect(new URL(up.uploadUrl).hostname.endsWith('.invalid')).toBe(true);
  });
});

describe('outbox', () => {
  it('persists, caps, clears and notifies', () => {
    const storage = createMemoryStorage();
    let n = 0;
    const ob = createOutbox({ storage, now: () => '2026-10-24T00:00:00.000Z', newId: () => `o${String((n += 1))}` });
    let calls = 0;
    const off = ob.subscribe(() => (calls += 1));
    for (let i = 0; i < 205; i += 1) ob.record({ provider: 'email', action: 'send', summary: 'x', payload: {} });
    expect(ob.list()).toHaveLength(200);
    expect(ob.list()[0]?.id).toBe('o205');
    expect(createOutbox({ storage }).list()).toHaveLength(200);
    ob.clear();
    expect(ob.list()).toHaveLength(0);
    off();
    ob.record({ provider: 'email', action: 'send', summary: 'x', payload: {} });
    expect(calls).toBe(206);
  });
  it('survives corrupt storage', () => {
    const storage = createMemoryStorage();
    storage.setItem(OUTBOX_KEY, '{not json');
    expect(createOutbox({ storage }).list()).toEqual([]);
    storage.setItem(OUTBOX_KEY, '{"a":1}');
    expect(createOutbox({ storage }).list()).toEqual([]);
  });
});
