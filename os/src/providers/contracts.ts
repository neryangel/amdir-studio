/**
 * Provider contract suites. Any real adapter (Resend, Supabase Storage, Bunny Stream, a payment
 * gateway, a licensed invoicing provider) must pass the suite for its interface before it replaces
 * the mock. Usage in a test file:
 *
 *   describeEmailContract('resend', () => createResendEmailProvider(testConfig));
 *
 * Suites never assert mock-only details (outbox entries, DEMO- prefixes); those live in
 * providers.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { EmailProvider, InvoicingProvider, PaymentProvider, StorageProvider, VideoHostProvider } from './types';
import { ProviderError } from './types';

type Factory<T> = () => T | Promise<T>;

export function describeEmailContract(name: string, make: Factory<EmailProvider>): void {
  describe(`EmailProvider contract: ${name}`, () => {
    it('sends a valid message and returns a message id', async () => {
      const p = await make();
      const r = await p.send({ to: 'owner@example.invalid', subject: 'בדיקה', text: 'גוף', tag: 'contract' });
      expect(r.messageId).toEqual(expect.any(String));
      expect(r.messageId.length).toBeGreaterThan(0);
      expect(['queued', 'sent']).toContain(r.status);
    });
    it('gives distinct ids to distinct messages', async () => {
      const p = await make();
      const a = await p.send({ to: 'a@example.invalid', subject: 'א', text: '', tag: 'contract' });
      const b = await p.send({ to: 'b@example.invalid', subject: 'ב', text: '', tag: 'contract' });
      expect(a.messageId).not.toBe(b.messageId);
    });
    it('rejects an invalid recipient with ProviderError(invalid-input)', async () => {
      const p = await make();
      await expect(p.send({ to: 'not-an-email', subject: 'x', text: '', tag: 'contract' })).rejects.toMatchObject({
        name: 'ProviderError',
        code: 'invalid-input',
      });
    });
    it('rejects an empty subject', async () => {
      const p = await make();
      await expect(p.send({ to: 'a@example.invalid', subject: '  ', text: '', tag: 'contract' })).rejects.toBeInstanceOf(ProviderError);
    });
  });
}

export function describeStorageContract(name: string, make: Factory<StorageProvider>): void {
  describe(`StorageProvider contract: ${name}`, () => {
    it('stores an object and reports it with head()', async () => {
      const p = await make();
      const stored = await p.putObject({ key: 'contract/a.mp4', contentType: 'video/mp4', sizeBytes: 1234 });
      expect(stored).toEqual({ key: 'contract/a.mp4', contentType: 'video/mp4', sizeBytes: 1234 });
      expect(await p.head('contract/a.mp4')).toEqual(stored);
    });
    it('head() of a missing key is null', async () => {
      const p = await make();
      expect(await p.head('contract/missing')).toBeNull();
    });
    it('issues https signed URLs that expire in the future, never for missing objects', async () => {
      const p = await make();
      await p.putObject({ key: 'contract/b.png', contentType: 'image/png', sizeBytes: 10 });
      const s = await p.signedUrl('contract/b.png', 600);
      expect(s.url.startsWith('https://')).toBe(true);
      expect(Date.parse(s.expiresAt)).toBeGreaterThan(Date.now() - 1000);
      await expect(p.signedUrl('contract/missing', 600)).rejects.toMatchObject({ code: 'not-found' });
    });
    it('rejects path traversal keys and invalid TTLs', async () => {
      const p = await make();
      await expect(p.putObject({ key: '../etc/passwd', contentType: 'text/plain', sizeBytes: 1 })).rejects.toMatchObject({ code: 'invalid-input' });
      await expect(p.putObject({ key: '/abs', contentType: 'text/plain', sizeBytes: 1 })).rejects.toMatchObject({ code: 'invalid-input' });
      await p.putObject({ key: 'contract/c.txt', contentType: 'text/plain', sizeBytes: 1 });
      await expect(p.signedUrl('contract/c.txt', 0)).rejects.toMatchObject({ code: 'invalid-input' });
    });
  });
}

export function describeVideoHostContract(name: string, make: Factory<VideoHostProvider>): void {
  describe(`VideoHostProvider contract: ${name}`, () => {
    it('creates an upload and exposes playback for it', async () => {
      const p = await make();
      const up = await p.createUpload({ title: 'גרסה 1', sizeBytes: 1000 });
      expect(up.uploadUrl.startsWith('https://')).toBe(true);
      const pb = await p.playback(up.videoId);
      expect(pb.videoId).toBe(up.videoId);
      expect(['processing', 'ready', 'failed']).toContain(pb.status);
      if (pb.status === 'ready') expect(pb.hlsUrl).toMatch(/^https:\/\//);
    });
    it('unknown video ids reject with not-found', async () => {
      const p = await make();
      await expect(p.playback('nope')).rejects.toMatchObject({ code: 'not-found' });
    });
    it('rejects an empty title', async () => {
      const p = await make();
      await expect(p.createUpload({ title: ' ', sizeBytes: 1 })).rejects.toMatchObject({ code: 'invalid-input' });
    });
  });
}

export function describePaymentContract(name: string, make: Factory<PaymentProvider>): void {
  describe(`PaymentProvider contract: ${name}`, () => {
    it('creates an open https payment link for the exact agorot amount', async () => {
      const p = await make();
      const link = await p.createPaymentLink({ reference: 'Q-1', amount: 118_000, description: 'הצעה', customerEmail: null });
      expect(link.amount).toBe(118_000);
      expect(link.status).toBe('open');
      expect(link.url.startsWith('https://')).toBe(true);
      expect(await p.getPaymentLink(link.linkId)).toEqual(link);
    });
    it('rejects non-integer, zero and negative amounts', async () => {
      const p = await make();
      for (const amount of [0, -100, 10.5]) {
        await expect(p.createPaymentLink({ reference: 'Q-1', amount, description: '', customerEmail: null })).rejects.toMatchObject({
          code: 'invalid-input',
        });
      }
    });
    it('unknown link ids reject with not-found', async () => {
      const p = await make();
      await expect(p.getPaymentLink('nope')).rejects.toMatchObject({ code: 'not-found' });
    });
  });
}

export function describeInvoicingContract(name: string, make: Factory<InvoicingProvider>): void {
  describe(`InvoicingProvider contract: ${name}`, () => {
    const base = { docType: 'tax-invoice' as const, reference: 'Q-1', customerName: 'לקוח', vat: 0, issueDate: '2026-10-24' };
    it('below the threshold: issues without an allocation number', async () => {
      const p = await make();
      const r = await p.issue({ ...base, customerTaxId: '000000000', net: 499_999 });
      expect(r.documentNumber).toEqual(expect.any(String));
      expect(r.allocationStatus).toBe('not-required');
      expect(r.allocationNumber).toBeNull();
    });
    it('at the threshold for a business: obtains an allocation number', async () => {
      const p = await make();
      const r = await p.issue({ ...base, customerTaxId: '000000000', net: 500_000, vat: 90_000 });
      expect(r.allocationStatus).toBe('granted');
      expect(r.allocationNumber).toEqual(expect.any(String));
    });
    it('private customers never get an allocation request', async () => {
      const p = await make();
      const r = await p.issue({ ...base, customerTaxId: null, net: 5_000_000 });
      expect(r.allocationStatus).toBe('not-required');
    });
    it('a malformed tax id on a required invoice is rejected, not silently issued as granted', async () => {
      const p = await make();
      const r = await p.issue({ ...base, customerTaxId: '12', net: 900_000 });
      expect(r.allocationStatus).toBe('rejected');
      expect(r.allocationNumber).toBeNull();
    });
    it('rejects non-integer amounts', async () => {
      const p = await make();
      await expect(p.issue({ ...base, customerTaxId: null, net: 10.5 })).rejects.toMatchObject({ code: 'invalid-input' });
    });
    it('document numbers are unique', async () => {
      const p = await make();
      const a = await p.issue({ ...base, customerTaxId: null, net: 100 });
      const b = await p.issue({ ...base, customerTaxId: null, net: 100 });
      expect(a.documentNumber).not.toBe(b.documentNumber);
    });
  });
}
