import { allocationRequirement } from '../domain/invoicing';
import { formatAgorot } from '../domain/money';
import type { Outbox } from './outbox';
import type {
  EmailProvider,
  InvoicingProvider,
  PaymentLink,
  PaymentProvider,
  Providers,
  StorageProvider,
  StoredObject,
  VideoHostProvider,
  VideoPlayback,
} from './types';
import { ProviderError } from './types';

/** Reserved TLD (RFC 2606): mock URLs can never resolve to a real service. */
const MOCK_ORIGIN = 'https://mock.studio-os.invalid';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface MockContext {
  readonly outbox: Outbox;
  readonly now?: () => string;
  /** Deterministic counter for ids; tests pass their own. */
  readonly seq?: () => number;
}

function counter(): () => number {
  let n = 0;
  return () => (n += 1);
}

export function createMockEmailProvider(ctx: MockContext): EmailProvider {
  const seq = ctx.seq ?? counter();
  return {
    name: 'mock-email',
    send(message) {
      if (!EMAIL_RE.test(message.to)) return Promise.reject(new ProviderError('email', 'invalid-input', 'Recipient is not an email address'));
      if (!message.subject.trim()) return Promise.reject(new ProviderError('email', 'invalid-input', 'Subject is required'));
      const messageId = `mock-msg-${String(seq())}`;
      ctx.outbox.record({
        provider: 'email',
        action: 'send',
        summary: `מייל ״${message.subject}״ אל ${message.to}`,
        payload: { messageId, ...message },
      });
      return Promise.resolve({ messageId, status: 'queued' });
    },
  };
}

export function createMockStorageProvider(ctx: MockContext): StorageProvider {
  const now = ctx.now ?? (() => new Date().toISOString());
  const objects = new Map<string, StoredObject>();
  return {
    name: 'mock-storage',
    putObject(input) {
      if (!input.key || input.key.startsWith('/') || input.key.includes('..')) {
        return Promise.reject(new ProviderError('storage', 'invalid-input', 'Invalid object key'));
      }
      if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
        return Promise.reject(new ProviderError('storage', 'invalid-input', 'Invalid size'));
      }
      const obj: StoredObject = { key: input.key, sizeBytes: input.sizeBytes, contentType: input.contentType };
      objects.set(input.key, obj);
      ctx.outbox.record({ provider: 'storage', action: 'putObject', summary: `העלאת קובץ פרטי ${input.key}`, payload: { ...input } });
      return Promise.resolve(obj);
    },
    head(key) {
      return Promise.resolve(objects.get(key) ?? null);
    },
    signedUrl(key, ttlSeconds) {
      if (!objects.has(key)) return Promise.reject(new ProviderError('storage', 'not-found', `No object ${key}`));
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 7 * 24 * 3600) {
        return Promise.reject(new ProviderError('storage', 'invalid-input', 'TTL must be 1s..7d'));
      }
      const expiresAt = new Date(Date.parse(now()) + ttlSeconds * 1000).toISOString();
      return Promise.resolve({ url: `${MOCK_ORIGIN}/signed/${encodeURIComponent(key)}?exp=${encodeURIComponent(expiresAt)}`, expiresAt });
    },
  };
}

export function createMockVideoHostProvider(ctx: MockContext): VideoHostProvider {
  const seq = ctx.seq ?? counter();
  const videos = new Map<string, VideoPlayback>();
  return {
    name: 'mock-video',
    createUpload(input) {
      if (!input.title.trim()) return Promise.reject(new ProviderError('video', 'invalid-input', 'Title is required'));
      const videoId = `mock-vid-${String(seq())}`;
      videos.set(videoId, { videoId, status: 'ready', hlsUrl: `${MOCK_ORIGIN}/hls/${videoId}.m3u8`, posterUrl: `${MOCK_ORIGIN}/poster/${videoId}.jpg` });
      ctx.outbox.record({ provider: 'video', action: 'createUpload', summary: `יצירת העלאת וידאו ״${input.title}״`, payload: { videoId, ...input } });
      return Promise.resolve({ videoId, uploadUrl: `${MOCK_ORIGIN}/upload/${videoId}` });
    },
    playback(videoId) {
      const v = videos.get(videoId);
      if (!v) return Promise.reject(new ProviderError('video', 'not-found', `No video ${videoId}`));
      return Promise.resolve(v);
    },
  };
}

export function createMockPaymentProvider(ctx: MockContext): PaymentProvider {
  const seq = ctx.seq ?? counter();
  const links = new Map<string, PaymentLink>();
  return {
    name: 'mock-payment',
    createPaymentLink(input) {
      if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
        return Promise.reject(new ProviderError('payment', 'invalid-input', 'Amount must be a positive integer of agorot'));
      }
      if (!input.reference.trim()) return Promise.reject(new ProviderError('payment', 'invalid-input', 'Reference is required'));
      const linkId = `mock-pay-${String(seq())}`;
      const link: PaymentLink = { linkId, url: `${MOCK_ORIGIN}/pay/${linkId}`, amount: input.amount, status: 'open' };
      links.set(linkId, link);
      ctx.outbox.record({
        provider: 'payment',
        action: 'createPaymentLink',
        summary: `קישור תשלום על ${formatAgorot(input.amount)} עבור ${input.reference}`,
        payload: { linkId, ...input },
      });
      return Promise.resolve(link);
    },
    getPaymentLink(linkId) {
      const link = links.get(linkId);
      if (!link) return Promise.reject(new ProviderError('payment', 'not-found', `No payment link ${linkId}`));
      return Promise.resolve(link);
    },
  };
}

/**
 * Mock invoicing. Uses the domain rule to decide whether an allocation number is needed and,
 * when it is, "grants" an obviously fake one (prefix DEMO-). A customer with a tax id is treated as a
 * business; a malformed tax id (not 9 digits) is rejected, like the Tax Authority would.
 */
export function createMockInvoicingProvider(ctx: MockContext): InvoicingProvider {
  const seq = ctx.seq ?? counter();
  return {
    name: 'mock-invoicing',
    issue(input) {
      if (!Number.isSafeInteger(input.net) || !Number.isSafeInteger(input.vat) || input.net < 0) {
        return Promise.reject(new ProviderError('invoicing', 'invalid-input', 'Amounts must be non-negative agorot'));
      }
      const n = seq();
      const documentNumber = `DEMO-INV-${String(n).padStart(5, '0')}`;
      const req = allocationRequirement({ docType: input.docType, net: input.net, issueDate: input.issueDate, toBusiness: input.customerTaxId !== null });
      let allocationStatus: 'not-required' | 'granted' | 'rejected' = 'not-required';
      let allocationNumber: string | null = null;
      if (req.required) {
        if (input.customerTaxId && /^\d{9}$/.test(input.customerTaxId)) {
          allocationStatus = 'granted';
          allocationNumber = `DEMO-ALLOC-${String(n).padStart(9, '0')}`;
        } else {
          allocationStatus = 'rejected';
        }
      }
      ctx.outbox.record({
        provider: 'invoicing',
        action: 'issue',
        summary: `חשבונית ${documentNumber} על ${formatAgorot(input.net + input.vat)}${req.required ? ` (מספר הקצאה: ${allocationNumber ?? 'נדחה'})` : ''}`,
        payload: { documentNumber, allocationStatus, allocationNumber, ...input },
      });
      return Promise.resolve({ documentNumber, allocationStatus, allocationNumber });
    },
  };
}

export function createMockProviders(ctx: MockContext): Providers {
  return {
    email: createMockEmailProvider(ctx),
    storage: createMockStorageProvider(ctx),
    video: createMockVideoHostProvider(ctx),
    payment: createMockPaymentProvider(ctx),
    invoicing: createMockInvoicingProvider(ctx),
  };
}
