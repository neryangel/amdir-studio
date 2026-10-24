import { useId, useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage, useAnnouncer } from '../../app/announcer';
import { useResource, useStudio } from '../../app/StudioContext';
import { formatDateTime } from '../../domain/dates';
import { PROJECT_KIND_LABEL } from '../../domain/labels';
import { LEAD_STATUS_LABEL, NEED_LABEL, SOURCE_LABEL, canConvertLead, projectKindForNeed } from '../../domain/lead';
import { STAGE_LABEL } from '../../domain/stages';
import { PROJECT_KINDS, type Client, type Lead, type LeadBrief, type ProjectKind } from '../../domain/types';
import { Badge, Button, ButtonLink, DemoTag, ErrorState, Field, LoadingState, PageHeader, describedBy } from '../../ui/primitives';
import { LEAD_TONE } from './LeadsPage';

const BRIEF_LABEL: Record<keyof LeadBrief, string> = {
  songUrl: 'קישור לשיר או לחומר',
  releaseDate: 'תאריך יציאה משוער',
  referenceUrl: 'סגנון או רפרנס',
  currentSiteUrl: 'אתר קיים',
  siteGoal: 'המטרה העיקרית',
  desiredDate: 'מועד רצוי',
  eventsPerYear: 'אירועים בשנה',
  currentTools: 'כלים היום',
};

function ConvertForm({ lead, clients }: { lead: Lead; clients: readonly Client[] }) {
  const { repos } = useStudio();
  const { announce } = useAnnouncer();
  const navigate = useNavigate();
  const id = useId();
  const [title, setTitle] = useState(`${NEED_LABEL[lead.need]} · ${lead.name}`);
  const [kind, setKind] = useState<ProjectKind>(projectKindForNeed(lead.need));
  const [startStage, setStartStage] = useState<'inquiry' | 'proposal'>('inquiry');
  const [clientChoice, setClientChoice] = useState<string>('new');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError('צריך שם לפרויקט.');
      document.getElementById(`${id}-title`)?.focus();
      return;
    }
    setTitleError(null);
    setFormError(null);
    setBusy(true);
    try {
      const plan = await repos.leads.convert(lead.id, {
        projectTitle: title,
        kind,
        startStage,
        existingClientId: clientChoice === 'new' ? null : clientChoice,
      });
      announce(`הליד הומר. נוצר פרויקט ״${plan.project.title}״ בשלב ${STAGE_LABEL[plan.project.stage]}.`);
      void navigate(`/projects?focus=${encodeURIComponent(plan.project.id)}`);
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form className="card convert" onSubmit={(e) => void submit(e)} noValidate aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="card__title">
        המרה ללקוח ולפרויקט
      </h2>
      <p className="muted">יוצר לקוח (או מקשר ללקוח קיים), פרויקט ואבן דרך ראשונה: שליחת הצעת מחיר בעוד שלושה ימים.</p>
      <Field id={`${id}-title`} label="שם הפרויקט" error={titleError}>
        <input
          id={`${id}-title`}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={describedBy(`${id}-title`, { error: titleError })}
          required
        />
      </Field>
      <div className="field-row">
        <Field id={`${id}-kind`} label="סוג">
          <select id={`${id}-kind`} className="input" value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-client`} label="לקוח">
          <select id={`${id}-client`} className="input" value={clientChoice} onChange={(e) => setClientChoice(e.target.value)}>
            <option value="new">לקוח חדש: {lead.name}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="fieldset">
        <legend className="field__label">שלב התחלה</legend>
        <div className="radio-row">
          {(['inquiry', 'proposal'] as const).map((s) => (
            <label key={s} className="radio">
              <input type="radio" name={`${id}-stage`} value={s} checked={startStage === s} onChange={() => setStartStage(s)} />
              {STAGE_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="form-actions">
        <Button type="submit" variant="primary" icon="sparkle" busy={busy} disabled={busy}>
          {busy ? 'ממיר…' : 'המרה ללקוח ופרויקט'}
        </Button>
      </div>
    </form>
  );
}

export function LeadDetailPage() {
  const { leadId = '' } = useParams();
  const { repos } = useStudio();
  const { announce } = useAnnouncer();
  const res = useResource(async (r) => ({ lead: await r.leads.get(leadId), clients: await r.clients.list() }), [leadId]);

  const back = (
    <ButtonLink to="/leads" variant="ghost" size="sm" icon="chevronStart">
      חזרה ללידים
    </ButtonLink>
  );
  if (res.status === 'loading') return (<>{back}<LoadingState label="טוען ליד…" /></>);
  if (res.status === 'error') return (<>{back}<ErrorState error={res.error} onRetry={res.reload} /></>);
  const { lead, clients } = res.data;
  if (!lead) {
    return (
      <>
        {back}
        <ErrorState title="הליד לא נמצא" error={Object.assign(new Error('not found'), { name: 'NotFoundError' })} />
      </>
    );
  }

  const setStatus = async (status: 'replied' | 'closed' | 'spam' | 'new') => {
    try {
      await repos.leads.setStatus(lead.id, status);
      announce(`הסטטוס עודכן ל״${LEAD_STATUS_LABEL[status]}״.`);
    } catch (e) {
      announce(errorMessage(e), 'error');
    }
  };

  const briefEntries = Object.entries(lead.brief ?? {}) as [keyof LeadBrief, string][];
  const contactHref = lead.contactType === 'email' ? `mailto:${lead.contact}` : `tel:${lead.contact.replace(/[^\d+]/g, '')}`;

  return (
    <>
      {back}
      <PageHeader
        eyebrow={
          <>
            ליד · {SOURCE_LABEL[lead.source]} {lead.demo ? <DemoTag /> : null}
          </>
        }
        title={lead.name}
        description={
          <>
            <Badge tone={LEAD_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge> <span className="muted num">התקבל {formatDateTime(lead.receivedAt)}</span>
          </>
        }
      />
      <div className="detail-grid">
        <div className="stack">
          <section className="card" aria-labelledby="lead-msg">
            <h2 id="lead-msg" className="card__title">
              הפנייה · {NEED_LABEL[lead.need]}
            </h2>
            <p className="prose">{lead.details}</p>
            {briefEntries.length > 0 ? (
              <dl className="kv">
                {briefEntries.map(([k, v]) => (
                  <div key={k} className="kv__row">
                    <dt>{BRIEF_LABEL[k]}</dt>
                    <dd dir={/^https?:/.test(v) ? 'ltr' : undefined}>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
          {canConvertLead(lead) ? (
            <ConvertForm lead={lead} clients={clients} />
          ) : lead.status === 'converted' && lead.convertedProjectId ? (
            <section className="card card--ok">
              <h2 className="card__title">הליד הומר לפרויקט</h2>
              <div className="form-actions">
                <ButtonLink to={`/projects/${lead.convertedProjectId}`} variant="primary">
                  לפרויקט
                </ButtonLink>
                {lead.convertedClientId ? <ButtonLink to={`/clients/${lead.convertedClientId}`}>ללקוח</ButtonLink> : null}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="stack" aria-label="פרטי קשר ופעולות">
          <section className="card" aria-labelledby="lead-contact">
            <h2 id="lead-contact" className="card__title">
              יצירת קשר
            </h2>
            <p>
              <a className="link" href={contactHref} dir="ltr">
                {lead.contact}
              </a>
            </p>
            <dl className="kv kv--compact">
              <div className="kv__row">
                <dt>הסכמה לפרטיות</dt>
                <dd className="num">{formatDateTime(lead.consentAt)}</dd>
              </div>
              <div className="kv__row">
                <dt>דיוור שיווקי</dt>
                <dd>{lead.marketingOptIn ? 'אישר/ה' : 'לא אישר/ה'}</dd>
              </div>
              <div className="kv__row">
                <dt>גרסת הודעה</dt>
                <dd className="mono">{lead.noticeVersion}</dd>
              </div>
            </dl>
          </section>
          {lead.status !== 'converted' ? (
            <section className="card" aria-labelledby="lead-status">
              <h2 id="lead-status" className="card__title">
                סטטוס
              </h2>
              <div className="button-stack">
                {lead.status !== 'replied' ? (
                  <Button size="sm" onClick={() => void setStatus('replied')}>
                    סימון כנענה
                  </Button>
                ) : null}
                {lead.status !== 'closed' ? (
                  <Button size="sm" onClick={() => void setStatus('closed')}>
                    סגירה בלי פרויקט
                  </Button>
                ) : null}
                {lead.status !== 'spam' ? (
                  <Button size="sm" variant="ghost" onClick={() => void setStatus('spam')}>
                    סימון כספאם
                  </Button>
                ) : null}
                {lead.status === 'closed' || lead.status === 'spam' ? (
                  <Button size="sm" onClick={() => void setStatus('new')}>
                    פתיחה מחדש
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
          <p className="muted small">
            <Link className="link" to="/clients">
              כל הלקוחות
            </Link>
          </p>
        </aside>
      </div>
    </>
  );
}
