import type { Agorot } from './money';
import type { ProjectStage } from './stages';

/** ISO-8601 timestamp (UTC), e.g. "2026-10-24T09:30:00.000Z". */
export type IsoDateTime = string;
/** ISO calendar date, e.g. "2026-10-24". */
export type IsoDate = string;

/** Every record carries `demo`. Seeded records are `demo: true`; the UI never hides that. */
export interface RecordBase {
  readonly id: string;
  readonly demo: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

// ---------- Leads (ingested from the public site form, see server/lead/schema.ts) ----------

/** Mirrors LEAD_NEEDS in the root site's src/lib/lead-shared.ts. */
export const LEAD_NEEDS = ['clip', 'video', 'ai', 'web', 'pilot', 'other'] as const;
export type LeadNeed = (typeof LEAD_NEEDS)[number];
/** Mirrors LEAD_SOURCES. */
export const LEAD_SOURCES = ['contact', 'pilot'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ['new', 'replied', 'converted', 'closed', 'spam'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadBrief {
  readonly songUrl?: string;
  readonly releaseDate?: string;
  readonly referenceUrl?: string;
  readonly currentSiteUrl?: string;
  readonly siteGoal?: 'leads' | 'brand' | 'sales' | 'other';
  readonly desiredDate?: string;
  readonly eventsPerYear?: '1-10' | '11-30' | '31-60' | '61+';
  readonly currentTools?: string;
}

export interface Lead extends RecordBase {
  readonly receivedAt: IsoDateTime;
  readonly source: LeadSource;
  readonly name: string;
  readonly contact: string;
  readonly contactType: 'email' | 'phone';
  readonly need: LeadNeed;
  readonly details: string;
  readonly brief: LeadBrief | null;
  readonly marketingOptIn: boolean;
  readonly noticeVersion: string;
  readonly consentAt: IsoDateTime;
  readonly status: LeadStatus;
  readonly convertedClientId: string | null;
  readonly convertedProjectId: string | null;
}

// ---------- Clients ----------

export interface Client extends RecordBase {
  readonly name: string;
  /** Business name, if the client is a business. */
  readonly company: string | null;
  /** ח.פ. / ע.מ. for business clients (tax invoices, allocation numbers). Null for private clients. */
  readonly taxId: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string;
  readonly sourceLeadId: string | null;
  /** Portal access for this client (mock auth now, Supabase + RLS later). */
  readonly portalEnabled: boolean;
}

// ---------- Projects ----------

export const PROJECT_KINDS = ['clip', 'video', 'motion', 'visuals', 'web', 'other'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export interface StageChange {
  readonly from: ProjectStage | null;
  readonly to: ProjectStage;
  readonly at: IsoDateTime;
}

export interface Project extends RecordBase {
  readonly clientId: string;
  readonly title: string;
  readonly kind: ProjectKind;
  readonly stage: ProjectStage;
  /** Stage the project was in before it was archived; restored on un-archive. */
  readonly stageBeforeArchive: ProjectStage | null;
  readonly stageHistory: readonly StageChange[];
  readonly summary: string;
  readonly dueDate: IsoDate | null;
}

export interface Task extends RecordBase {
  readonly projectId: string;
  readonly title: string;
  readonly dueDate: IsoDate | null;
  readonly done: boolean;
  readonly doneAt: IsoDateTime | null;
}

export interface Milestone extends RecordBase {
  readonly projectId: string;
  readonly title: string;
  readonly date: IsoDate;
  readonly done: boolean;
  /** Milestone visible to the client in the portal. */
  readonly clientVisible: boolean;
}

// ---------- Money ----------

export interface QuoteLine {
  readonly id: string;
  readonly description: string;
  /** Up to 2 decimals (e.g. 1.5 shooting days). */
  readonly quantity: number;
  readonly unitPrice: Agorot;
}

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export interface Quote extends RecordBase {
  readonly projectId: string;
  readonly clientId: string;
  /** Human number, e.g. "Q-2026-014". */
  readonly number: string;
  readonly title: string;
  readonly lines: readonly QuoteLine[];
  /** Fixed discount before VAT. */
  readonly discount: Agorot;
  /** VAT rate in basis points, fixed at the time the quote was created. */
  readonly vatRate: number;
  readonly status: QuoteStatus;
  readonly issuedOn: IsoDate;
  readonly validUntil: IsoDate | null;
  readonly sentAt: IsoDateTime | null;
  readonly acceptedAt: IsoDateTime | null;
  /** Amount received so far (gross, incl. VAT). */
  readonly paid: Agorot;
  /** Payment link id from the PaymentProvider, if one was created. */
  readonly paymentLinkId: string | null;
  /** Tax invoice issued through the InvoicingProvider, if any. */
  readonly invoice: InvoiceRecord | null;
}

export type AllocationStatus = 'not-required' | 'required' | 'pending' | 'granted' | 'rejected';

export interface InvoiceRecord {
  readonly documentNumber: string;
  readonly issuedAt: IsoDateTime;
  readonly allocationStatus: AllocationStatus;
  /** מספר הקצאה from the Israel Tax Authority, via the invoicing provider. */
  readonly allocationNumber: string | null;
}

// ---------- Files, versions, review ----------

export const ASSET_KINDS = ['video', 'image', 'audio', 'document', 'link'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export interface Asset extends RecordBase {
  readonly projectId: string;
  readonly title: string;
  readonly kind: AssetKind;
}

export const VERSION_STATUSES = ['draft', 'awaiting-client', 'changes-requested', 'approved'] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export interface AssetVersion extends RecordBase {
  readonly assetId: string;
  /** 1, 2, 3 ... per asset. */
  readonly number: number;
  readonly status: VersionStatus;
  readonly fileName: string;
  readonly sizeBytes: number;
  /** Duration for time-based media. */
  readonly durationMs: number | null;
  /** Storage key or video-host id from the providers. Never a public object URL. */
  readonly storageRef: string;
  readonly note: string;
}

export interface ReviewComment extends RecordBase {
  readonly versionId: string;
  readonly author: 'owner' | 'client';
  readonly body: string;
  /** Position in the media, in milliseconds. Null for whole-file comments. */
  readonly timecodeMs: number | null;
  readonly resolved: boolean;
}

export interface Delivery extends RecordBase {
  readonly projectId: string;
  readonly versionIds: readonly string[];
  readonly deliveredAt: IsoDateTime;
  readonly note: string;
}
