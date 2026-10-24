import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage, useAnnouncer } from '../../app/announcer';
import { useResource, useStudio } from '../../app/StudioContext';
import { formatDateTime } from '../../domain/dates';
import { LEAD_STATUS_LABEL, NEED_LABEL, SOURCE_LABEL, type StudioLeadRow } from '../../domain/lead';
import type { Lead, LeadStatus } from '../../domain/types';
import { Badge, Button, EmptyState, ErrorState, LoadingState, PageHeader, type Tone } from '../../ui/primitives';

const FILTERS = [
  { key: 'open', label: 'פתוחים', match: (l: Lead) => l.status === 'new' || l.status === 'replied' },
  { key: 'new', label: 'חדשים', match: (l: Lead) => l.status === 'new' },
  { key: 'converted', label: 'הומרו', match: (l: Lead) => l.status === 'converted' },
  { key: 'closed', label: 'סגורים וספאם', match: (l: Lead) => l.status === 'closed' || l.status === 'spam' },
  { key: 'all', label: 'הכול', match: () => true },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

export const LEAD_TONE: Record<LeadStatus, Tone> = {
  new: 'accent',
  replied: 'info',
  converted: 'ok',
  closed: 'neutral',
  spam: 'neutral',
};

/** Builds a fake form submission, shaped exactly like a public.studio_leads row. */
function simulatedRow(now: string, n: number): StudioLeadRow {
  const samples = [
    { need: 'video', details: 'צריך עריכה לסרטון תדמית של שלוש דקות מחומרים שכבר צילמנו.' },
    { need: 'clip', details: 'מחפשת במאי לקליפ לשיר בלדה, צילום בטבע.' },
    { need: 'web', details: 'אתר תיק עבודות לצלם, עם גלריות.' },
  ] as const;
  const s = samples[n % samples.length] ?? samples[0];
  const letter = 'טיכלמנסעפצקרשת'[n % 14] ?? 'ט';
  return {
    id: `sim-lead-${now}`,
    created_at: now,
    source: 'contact',
    name: `פונה לדוגמה ${letter}׳`,
    contact: `demo-sim-${String(n)}@example.invalid`,
    contact_type: 'email',
    need: s.need,
    details: s.details,
    brief: null,
    privacy_consent: true,
    marketing_opt_in: false,
    notice_version: 'lead-notice-2026-10-23',
    consent_at: now,
    status: 'new',
  };
}

export function LeadsPage() {
  const { repos, now } = useStudio();
  const { announce } = useAnnouncer();
  const [params, setParams] = useSearchParams();
  const filterKey: FilterKey = (FILTERS.find((f) => f.key === params.get('show'))?.key ?? 'open');
  const res = useResource((r) => r.leads.list(), []);
  const [simulating, setSimulating] = useState(false);

  const simulate = async () => {
    setSimulating(true);
    try {
      const count = (await repos.leads.list()).length;
      const lead = await repos.leads.ingest(simulatedRow(now(), count));
      announce(`ליד חדש התקבל מהאתר: ${lead.name}`);
    } catch (e) {
      announce(errorMessage(e), 'error');
    } finally {
      setSimulating(false);
    }
  };

  const header = (
    <PageHeader
      eyebrow="תיבת לידים"
      title="לידים"
      description="פניות מטופס האתר נכנסות לכאן. ממירים ליד ללקוח ולפרויקט בלחיצה."
      actions={
        <Button icon="plus" onClick={() => void simulate()} busy={simulating} disabled={simulating}>
          הדמיית ליד מהאתר
        </Button>
      }
    />
  );

  if (res.status === 'loading') return (<>{header}<LoadingState label="טוען לידים…" /></>);
  if (res.status === 'error') return (<>{header}<ErrorState error={res.error} onRetry={res.reload} /></>);

  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0];
  const shown = res.data.filter(filter.match);

  return (
    <>
      {header}
      <div className="toolbar" role="group" aria-label="סינון לידים">
        {FILTERS.map((f) => {
          const count = res.data.filter(f.match).length;
          return (
            <button
              key={f.key}
              type="button"
              className="chip"
              aria-pressed={f.key === filterKey}
              onClick={() => setParams(f.key === 'open' ? {} : { show: f.key }, { replace: true })}
            >
              {f.label}
              <span className="chip__count num">{count}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="inbox" title={filterKey === 'open' ? 'אין לידים פתוחים' : 'אין לידים בסינון הזה'}>
          {filterKey === 'open' ? 'כל הפניות טופלו. פנייה חדשה מהאתר תופיע כאן מיד.' : 'נסו סינון אחר.'}
        </EmptyState>
      ) : (
        <ul className="row-list" aria-label={`לידים: ${filter.label}`}>
          {shown.map((lead) => (
            <li key={lead.id} className="row">
              <div className="row__main">
                <Link to={`/leads/${lead.id}`} className="row__title stretched">
                  {lead.name}
                </Link>
                <p className="row__excerpt">{lead.details}</p>
              </div>
              <div className="row__meta">
                <span>{NEED_LABEL[lead.need]}</span>
                <span className="muted">{SOURCE_LABEL[lead.source]}</span>
                <span className="muted num">{formatDateTime(lead.receivedAt)}</span>
              </div>
              <div className="row__end">
                <Badge tone={LEAD_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
