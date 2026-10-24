import { describe, expect, it } from 'vitest';
import {
  LeadConversionError,
  type StudioLeadRow,
  canConvertLead,
  leadFromStudioRow,
  planLeadConversion,
  projectKindForNeed,
} from './lead';
import type { Lead } from './types';

const row = (partial: Partial<StudioLeadRow> = {}): StudioLeadRow => ({
  id: 'lead-1',
  created_at: '2026-10-20T08:00:00.000Z',
  source: 'contact',
  name: ' לקוח לדוגמה א׳ ',
  contact: 'demo-a@example.invalid',
  contact_type: 'email',
  need: 'clip',
  details: 'קליפ לסינגל חדש',
  brief: { songUrl: 'https://example.invalid/song', releaseDate: '2026-12', injected: '<script>' },
  privacy_consent: true,
  marketing_opt_in: false,
  notice_version: 'lead-notice-2026-10-23',
  consent_at: '2026-10-20T08:00:00.000Z',
  status: 'new',
  ...partial,
});

function ingest(r: StudioLeadRow): Lead {
  const res = leadFromStudioRow(r, { demo: true });
  if (!res.ok) throw new Error(res.errors.join(','));
  return res.lead;
}

describe('leadFromStudioRow (public form → Studio OS)', () => {
  it('maps a valid studio_leads row and trims text', () => {
    const lead = ingest(row());
    expect(lead.name).toBe('לקוח לדוגמה א׳');
    expect(lead.contactType).toBe('email');
    expect(lead.status).toBe('new');
    expect(lead.demo).toBe(true);
    expect(lead.receivedAt).toBe('2026-10-20T08:00:00.000Z');
  });
  it('keeps known brief keys and drops unknown ones', () => {
    expect(ingest(row()).brief).toEqual({ songUrl: 'https://example.invalid/song', releaseDate: '2026-12' });
    expect(ingest(row({ brief: { injected: 'x' } })).brief).toBeNull();
    expect(ingest(row({ brief: null })).brief).toBeNull();
  });
  it('rejects rows that break invariants and names the fields', () => {
    const res = leadFromStudioRow(
      row({ source: 'ads', need: 'nope', contact_type: 'fax', privacy_consent: false, name: ' ', status: 'weird', created_at: 'yesterday' }),
      { demo: false },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.sort()).toEqual(['contact_type', 'created_at', 'name', 'need', 'privacy_consent', 'source', 'status']);
  });
  it('enforces the site length limits', () => {
    expect(leadFromStudioRow(row({ details: 'x'.repeat(4001) }), { demo: true }).ok).toBe(false);
    expect(leadFromStudioRow(row({ name: 'x'.repeat(121) }), { demo: true }).ok).toBe(false);
  });
});

describe('lead conversion', () => {
  let n = 0;
  const ctx = { now: '2026-10-24T09:00:00.000Z', newId: (p: string) => `${p}-${String(++n)}` };

  it('maps needs to project kinds', () => {
    expect(projectKindForNeed('ai')).toBe('visuals');
    expect(projectKindForNeed('web')).toBe('web');
    expect(projectKindForNeed('pilot')).toBe('other');
  });
  it('only new or replied leads convert', () => {
    expect(canConvertLead({ status: 'new' })).toBe(true);
    expect(canConvertLead({ status: 'replied' })).toBe(true);
    expect(canConvertLead({ status: 'spam' })).toBe(false);
    expect(canConvertLead({ status: 'converted' })).toBe(false);
  });
  it('plans a new client, a project with history, a first milestone and marks the lead converted', () => {
    const lead = ingest(row());
    const plan = planLeadConversion(lead, { projectTitle: ' קליפ לסינגל ', kind: 'clip', startStage: 'inquiry', existingClientId: null }, ctx);
    expect(plan.client?.email).toBe('demo-a@example.invalid');
    expect(plan.client?.phone).toBeNull();
    expect(plan.client?.sourceLeadId).toBe(lead.id);
    expect(plan.project.title).toBe('קליפ לסינגל');
    expect(plan.project.clientId).toBe(plan.client?.id);
    expect(plan.project.stageHistory).toEqual([{ from: null, to: 'inquiry', at: ctx.now }]);
    expect(plan.milestones[0]?.date).toBe('2026-10-27');
    expect(plan.lead.status).toBe('converted');
    expect(plan.lead.convertedProjectId).toBe(plan.project.id);
    expect(plan.project.demo).toBe(true);
  });
  it('links to an existing client without creating one', () => {
    const lead = ingest(row({ contact: '050-0000000', contact_type: 'phone' }));
    const plan = planLeadConversion(lead, { projectTitle: 'אתר', kind: 'web', startStage: 'proposal', existingClientId: 'cli-x' }, ctx);
    expect(plan.client).toBeNull();
    expect(plan.project.clientId).toBe('cli-x');
    expect(plan.project.stage).toBe('proposal');
  });
  it('refuses closed leads and empty titles', () => {
    const lead = ingest(row({ status: 'closed' }));
    expect(() => planLeadConversion(lead, { projectTitle: 'x', kind: 'clip', startStage: 'inquiry', existingClientId: null }, ctx)).toThrow(
      LeadConversionError,
    );
    expect(() =>
      planLeadConversion(ingest(row()), { projectTitle: '  ', kind: 'clip', startStage: 'inquiry', existingClientId: null }, ctx),
    ).toThrow(/title/);
  });
});
