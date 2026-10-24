import type { ConversionInput, ConversionPlan, StudioLeadRow } from '../domain/lead';
import type { ProjectStage } from '../domain/stages';
import type {
  Asset,
  AssetVersion,
  Client,
  Delivery,
  InvoiceRecord,
  IsoDate,
  Lead,
  LeadStatus,
  Milestone,
  Project,
  Quote,
  QuoteLine,
  QuoteStatus,
  ReviewComment,
  Task,
} from '../domain/types';

/**
 * Repository contracts. The UI only ever talks to these interfaces.
 * Today: the in-memory adapter (memoryRepositories.ts) persisted to localStorage.
 * Later: a Supabase adapter with RLS implements the same interfaces; no UI code changes.
 * Every method is async so the UI is already written for network latency and failure.
 */

export interface StudioSnapshot {
  readonly leads: readonly Lead[];
  readonly clients: readonly Client[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly milestones: readonly Milestone[];
  readonly quotes: readonly Quote[];
  readonly assets: readonly Asset[];
  readonly versions: readonly AssetVersion[];
  readonly comments: readonly ReviewComment[];
  readonly deliveries: readonly Delivery[];
}

export class NotFoundError extends Error {
  constructor(
    readonly entity: string,
    readonly id: string,
  ) {
    super(`${entity} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly fields: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface LeadRepository {
  list(): Promise<Lead[]>;
  get(id: string): Promise<Lead | null>;
  /** Ingest a row of public.studio_leads (the public site's form). Idempotent on id. */
  ingest(row: StudioLeadRow): Promise<Lead>;
  setStatus(id: string, status: Exclude<LeadStatus, 'converted'>): Promise<Lead>;
  /** Atomically: create/link client, create project + first milestone, mark lead converted. */
  convert(id: string, input: ConversionInput): Promise<ConversionPlan>;
}

export interface ClientRepository {
  list(): Promise<Client[]>;
  get(id: string): Promise<Client | null>;
  update(id: string, patch: Partial<Pick<Client, 'name' | 'company' | 'taxId' | 'email' | 'phone' | 'notes' | 'portalEnabled'>>): Promise<Client>;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  listByClient(clientId: string): Promise<Project[]>;
  /** Enforces the stage transition rules (domain/stages.ts). */
  move(id: string, to: ProjectStage): Promise<Project>;
  update(id: string, patch: Partial<Pick<Project, 'title' | 'summary' | 'dueDate' | 'kind'>>): Promise<Project>;
}

export interface TaskRepository {
  listAll(): Promise<Task[]>;
  listByProject(projectId: string): Promise<Task[]>;
  create(input: { projectId: string; title: string; dueDate: IsoDate | null }): Promise<Task>;
  setDone(id: string, done: boolean): Promise<Task>;
}

export interface MilestoneRepository {
  listAll(): Promise<Milestone[]>;
  listByProject(projectId: string): Promise<Milestone[]>;
  create(input: { projectId: string; title: string; date: IsoDate; clientVisible: boolean }): Promise<Milestone>;
  setDone(id: string, done: boolean): Promise<Milestone>;
}

export interface QuoteDraftInput {
  readonly title: string;
  readonly lines: readonly QuoteLine[];
  readonly discount: number;
  readonly validUntil: IsoDate | null;
}

export interface QuoteRepository {
  listAll(): Promise<Quote[]>;
  listByProject(projectId: string): Promise<Quote[]>;
  get(id: string): Promise<Quote | null>;
  createDraft(projectId: string): Promise<Quote>;
  /** Only drafts are editable. */
  saveDraft(id: string, input: QuoteDraftInput): Promise<Quote>;
  setStatus(id: string, status: QuoteStatus): Promise<Quote>;
  recordPayment(id: string, amount: number): Promise<Quote>;
  attachPaymentLink(id: string, linkId: string): Promise<Quote>;
  attachInvoice(id: string, invoice: InvoiceRecord): Promise<Quote>;
}

export interface AssetBundle {
  readonly asset: Asset;
  readonly versions: readonly (AssetVersion & { readonly comments: readonly ReviewComment[] })[];
}

export interface AssetRepository {
  listByProject(projectId: string): Promise<AssetBundle[]>;
  listDeliveries(projectId: string): Promise<Delivery[]>;
}

export interface Repositories {
  readonly leads: LeadRepository;
  readonly clients: ClientRepository;
  readonly projects: ProjectRepository;
  readonly tasks: TaskRepository;
  readonly milestones: MilestoneRepository;
  readonly quotes: QuoteRepository;
  readonly assets: AssetRepository;
  /** Everything at once (dashboard). A network adapter may batch this. */
  snapshot(): Promise<StudioSnapshot>;
  /** Called after every write. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Demo only: wipe local data and re-seed. */
  resetDemo(): Promise<void>;
  /** True when writes survive a reload (localStorage available). */
  isPersistent(): boolean;
}
