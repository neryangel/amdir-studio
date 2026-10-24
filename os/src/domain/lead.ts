import { addDays, israelDate } from './dates';
import type { ProjectStage } from './stages';
import {
  type Client,
  type IsoDateTime,
  type Lead,
  type LeadBrief,
  type LeadNeed,
  type LeadStatus,
  type Milestone,
  type Project,
  type ProjectKind,
  LEAD_NEEDS,
  LEAD_SOURCES,
} from './types';

/**
 * A row of public.studio_leads (supabase/leads.sql), as written by the public site's lead function
 * after server/lead/schema.ts validated the form. Studio OS ingests exactly this shape.
 */
export interface StudioLeadRow {
  id: string;
  created_at: string;
  source: string;
  name: string;
  contact: string;
  contact_type: string;
  need: string;
  details: string;
  brief: Record<string, unknown> | null;
  privacy_consent: boolean;
  marketing_opt_in: boolean;
  notice_version: string;
  consent_at: string;
  status: string;
}

export type IngestResult = { ok: true; lead: Lead } | { ok: false; errors: string[] };

const BRIEF_KEYS = [
  'songUrl',
  'releaseDate',
  'referenceUrl',
  'currentSiteUrl',
  'siteGoal',
  'desiredDate',
  'eventsPerYear',
  'currentTools',
] as const;

/** Maps the site's 4 lead statuses to Studio OS statuses (OS adds `converted`). */
function mapStatus(status: string): LeadStatus | null {
  return status === 'new' || status === 'replied' || status === 'closed' || status === 'spam' ? status : null;
}

function isIsoInstant(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
}

/**
 * Defensive mapping. The row was validated by the site already, but Studio OS re-checks the
 * invariants it relies on and never trusts unknown brief keys (they are dropped, not stored).
 */
export function leadFromStudioRow(row: StudioLeadRow, opts: { demo: boolean }): IngestResult {
  const errors: string[] = [];
  if (!row.id) errors.push('id');
  if (!isIsoInstant(row.created_at)) errors.push('created_at');
  if (!(LEAD_SOURCES as readonly string[]).includes(row.source)) errors.push('source');
  if (!row.name.trim() || row.name.length > 120) errors.push('name');
  if (!row.contact.trim() || row.contact.length > 200) errors.push('contact');
  if (row.contact_type !== 'email' && row.contact_type !== 'phone') errors.push('contact_type');
  if (!(LEAD_NEEDS as readonly string[]).includes(row.need)) errors.push('need');
  if (!row.details.trim() || row.details.length > 4000) errors.push('details');
  if (!row.privacy_consent) errors.push('privacy_consent');
  if (!isIsoInstant(row.consent_at)) errors.push('consent_at');
  const status = mapStatus(row.status);
  if (!status) errors.push('status');
  if (errors.length > 0 || !status) return { ok: false, errors };

  let brief: LeadBrief | null = null;
  if (row.brief) {
    const picked: Record<string, string> = {};
    for (const key of BRIEF_KEYS) {
      const v = row.brief[key];
      if (typeof v === 'string' && v.trim()) picked[key] = v.trim();
    }
    brief = Object.keys(picked).length > 0 ? picked : null;
  }

  return {
    ok: true,
    lead: {
      id: row.id,
      demo: opts.demo,
      createdAt: row.created_at,
      updatedAt: row.created_at,
      receivedAt: row.created_at,
      source: row.source as Lead['source'],
      name: row.name.trim(),
      contact: row.contact.trim(),
      contactType: row.contact_type as Lead['contactType'],
      need: row.need as LeadNeed,
      details: row.details.trim(),
      brief,
      marketingOptIn: row.marketing_opt_in,
      noticeVersion: row.notice_version,
      consentAt: row.consent_at,
      status,
      convertedClientId: null,
      convertedProjectId: null,
    },
  };
}

export const NEED_LABEL: Record<LeadNeed, string> = {
  clip: 'קליפ',
  video: 'עריכת וידאו',
  ai: 'ויז׳ואלים ו-AI',
  web: 'אתר',
  pilot: 'פיילוט Event Pro',
  other: 'אחר',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'חדש',
  replied: 'נענה',
  converted: 'הומר לפרויקט',
  closed: 'סגור',
  spam: 'ספאם',
};

export const SOURCE_LABEL: Record<Lead['source'], string> = {
  contact: 'טופס יצירת קשר',
  pilot: 'טופס פיילוט',
};

export function projectKindForNeed(need: LeadNeed): ProjectKind {
  switch (need) {
    case 'clip':
      return 'clip';
    case 'video':
      return 'video';
    case 'ai':
      return 'visuals';
    case 'web':
      return 'web';
    case 'pilot':
    case 'other':
      return 'other';
  }
}

export function canConvertLead(lead: Pick<Lead, 'status'>): boolean {
  return lead.status === 'new' || lead.status === 'replied';
}

export interface ConversionInput {
  readonly projectTitle: string;
  readonly kind: ProjectKind;
  readonly startStage: Extract<ProjectStage, 'inquiry' | 'proposal'>;
  /** Link to an existing client instead of creating a new one. */
  readonly existingClientId: string | null;
}

export interface ConversionPlan {
  readonly client: Client | null;
  readonly project: Project;
  readonly milestones: readonly Milestone[];
  readonly lead: Lead;
}

export class LeadConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadConversionError';
  }
}

/**
 * Pure: everything a lead conversion writes. The repository layer applies it atomically.
 * A new client inherits the lead's contact; the project starts with a first-reply milestone.
 */
export function planLeadConversion(
  lead: Lead,
  input: ConversionInput,
  ctx: { now: IsoDateTime; newId: (prefix: string) => string },
): ConversionPlan {
  if (!canConvertLead(lead)) throw new LeadConversionError(`Lead ${lead.id} is "${lead.status}" and cannot be converted`);
  const title = input.projectTitle.trim();
  if (!title) throw new LeadConversionError('Project title is required');

  const base = { demo: lead.demo, createdAt: ctx.now, updatedAt: ctx.now };
  const client: Client | null = input.existingClientId
    ? null
    : {
        ...base,
        id: ctx.newId('cli'),
        name: lead.name,
        company: null,
        taxId: null,
        email: lead.contactType === 'email' ? lead.contact : null,
        phone: lead.contactType === 'phone' ? lead.contact : null,
        notes: '',
        sourceLeadId: lead.id,
        portalEnabled: false,
      };
  const clientId = input.existingClientId ?? (client as Client).id;
  const project: Project = {
    ...base,
    id: ctx.newId('prj'),
    clientId,
    title,
    kind: input.kind,
    stage: input.startStage,
    stageBeforeArchive: null,
    stageHistory: [{ from: null, to: input.startStage, at: ctx.now }],
    summary: lead.details,
    dueDate: null,
  };
  const today = israelDate(ctx.now);
  const milestones: Milestone[] = [
    {
      ...base,
      id: ctx.newId('mil'),
      projectId: project.id,
      title: 'שליחת הצעת מחיר',
      date: addDays(today, 3),
      done: false,
      clientVisible: false,
    },
  ];
  return {
    client,
    project,
    milestones,
    lead: { ...lead, status: 'converted', convertedClientId: clientId, convertedProjectId: project.id, updatedAt: ctx.now },
  };
}
