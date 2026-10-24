import type { InvoiceDocType } from '../domain/invoicing';
import type { Agorot } from '../domain/money';
import type { AllocationStatus, IsoDate } from '../domain/types';

/**
 * Provider interfaces. Studio OS code depends on these only. Each has a mock (mocks.ts) that
 * records to the in-app Outbox, and a contract suite (contracts/*.ts) that every future real
 * adapter must pass before it is wired in. Real providers are chosen by the owner, later.
 */

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly code: 'invalid-input' | 'not-found' | 'unavailable' | 'rejected',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ---------- Email ----------
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** For grouping in logs, e.g. "quote-sent". */
  readonly tag: string;
}
export interface EmailReceipt {
  readonly messageId: string;
  readonly status: 'queued' | 'sent';
}
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailReceipt>;
}

// ---------- Storage (private files: signed URLs only, never public object URLs) ----------
export interface PutObjectInput {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}
export interface StoredObject {
  readonly key: string;
  readonly sizeBytes: number;
  readonly contentType: string;
}
export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: string;
}
export interface StorageProvider {
  readonly name: string;
  putObject(input: PutObjectInput): Promise<StoredObject>;
  head(key: string): Promise<StoredObject | null>;
  signedUrl(key: string, ttlSeconds: number): Promise<SignedUrl>;
}

// ---------- Video hosting (review player, streaming) ----------
export interface VideoUpload {
  readonly videoId: string;
  /** Where the browser would upload the file directly (tus/presigned). */
  readonly uploadUrl: string;
}
export interface VideoPlayback {
  readonly videoId: string;
  readonly status: 'processing' | 'ready' | 'failed';
  readonly hlsUrl: string | null;
  readonly posterUrl: string | null;
}
export interface VideoHostProvider {
  readonly name: string;
  createUpload(input: { title: string; sizeBytes: number }): Promise<VideoUpload>;
  playback(videoId: string): Promise<VideoPlayback>;
}

// ---------- Payments (gateway-agnostic) ----------
export interface PaymentLinkInput {
  readonly reference: string;
  readonly amount: Agorot;
  readonly description: string;
  readonly customerEmail: string | null;
}
export interface PaymentLink {
  readonly linkId: string;
  readonly url: string;
  readonly amount: Agorot;
  readonly status: 'open' | 'paid' | 'expired' | 'cancelled';
}
export interface PaymentProvider {
  readonly name: string;
  createPaymentLink(input: PaymentLinkInput): Promise<PaymentLink>;
  getPaymentLink(linkId: string): Promise<PaymentLink>;
}

// ---------- Invoicing (Israeli e-invoicing, allocation numbers) ----------
export interface InvoiceInput {
  readonly docType: InvoiceDocType;
  readonly reference: string;
  readonly customerName: string;
  /** Business id (ח.פ. / ע.מ.) when the customer is a business; drives the allocation request. */
  readonly customerTaxId: string | null;
  readonly net: Agorot;
  readonly vat: Agorot;
  readonly issueDate: IsoDate;
}
export interface IssuedInvoice {
  readonly documentNumber: string;
  readonly allocationStatus: AllocationStatus;
  readonly allocationNumber: string | null;
}
export interface InvoicingProvider {
  readonly name: string;
  /** Issues the document. When the domain rule requires it, the provider obtains an allocation number first. */
  issue(input: InvoiceInput): Promise<IssuedInvoice>;
}

export interface Providers {
  readonly email: EmailProvider;
  readonly storage: StorageProvider;
  readonly video: VideoHostProvider;
  readonly payment: PaymentProvider;
  readonly invoicing: InvoicingProvider;
}
