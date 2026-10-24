import { useId, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage, useAnnouncer } from '../../app/announcer';
import { useResource, useStudio } from '../../app/StudioContext';
import { formatDate, formatDateTime, isIsoDate, israelDate, relativeDay } from '../../domain/dates';
import { ASSET_KIND_LABEL, VERSION_STATUS_LABEL, formatBytes } from '../../domain/labels';
import { PAYMENT_STATE_LABEL, QUOTE_STATUS_LABEL, paymentState, quoteTotals } from '../../domain/quote';
import { STAGE_LABEL } from '../../domain/stages';
import { formatTimecode } from '../../domain/timecode';
import type { VersionStatus } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { Badge, Button, EmptyState, ErrorState, Field, LoadingState, Money, describedBy, type Tone } from '../../ui/primitives';
import { useProject } from './ProjectLayout';

export function ProjectOverview() {
  const { project } = useProject();
  const { now } = useStudio();
  const today = israelDate(now());
  const res = useResource(
    async (r) => ({
      tasks: await r.tasks.listByProject(project.id),
      milestones: await r.milestones.listByProject(project.id),
      quotes: await r.quotes.listByProject(project.id),
    }),
    [project.id],
  );
  if (res.status === 'loading') return <LoadingState />;
  if (res.status === 'error') return <ErrorState error={res.error} onRetry={res.reload} />;
  const { tasks, milestones, quotes } = res.data;
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const nextMilestone = milestones.find((m) => !m.done && m.date >= today);
  const quote = quotes[0];

  return (
    <div className="detail-grid">
      <div className="stack">
        <section className="card" aria-labelledby="ov-summary">
          <h2 id="ov-summary" className="card__title">
            תקציר
          </h2>
          <p className="prose">{project.summary || 'אין תקציר עדיין.'}</p>
          <dl className="stats">
            <div className="stat">
              <dt>משימות פתוחות</dt>
              <dd className="num">{open.length}</dd>
            </div>
            <div className={`stat${overdue.length ? ' stat--alert' : ''}`}>
              <dt>באיחור</dt>
              <dd className="num">{overdue.length}</dd>
            </div>
            <div className="stat">
              <dt>מועד מסירה</dt>
              <dd className="num">{project.dueDate ? formatDate(project.dueDate, { short: true }) : '—'}</dd>
            </div>
            <div className="stat">
              <dt>הצעת מחיר</dt>
              <dd>{quote ? <Money agorot={quoteTotals(quote).total} compact /> : '—'}</dd>
            </div>
          </dl>
        </section>
        <section className="card" aria-labelledby="ov-next">
          <h2 id="ov-next" className="card__title">
            הדבר הבא
          </h2>
          {nextMilestone ? (
            <p>
              <strong>{nextMilestone.title}</strong> <span className="muted">· {relativeDay(nextMilestone.date, today)}</span>
            </p>
          ) : (
            <p className="muted">אין אבן דרך קרובה. כדאי לקבוע אחת.</p>
          )}
          {quote ? (
            <p>
              הצעה <span className="mono">{quote.number}</span>: {QUOTE_STATUS_LABEL[quote.status]}
              {quote.status === 'accepted' ? ` · ${PAYMENT_STATE_LABEL[paymentState(quote)]}` : ''} ·{' '}
              <Link className="link" to={`/projects/${project.id}/quote`}>
                לפתיחה
              </Link>
            </p>
          ) : null}
        </section>
      </div>
      <aside className="card" aria-labelledby="ov-history">
        <h2 id="ov-history" className="card__title">
          היסטוריית שלבים
        </h2>
        <ol className="history">
          {[...project.stageHistory].reverse().map((h, i) => (
            <li key={`${h.at}-${String(i)}`}>
              <span className="history__what">{h.from ? `${STAGE_LABEL[h.from]} ← ${STAGE_LABEL[h.to]}` : `נפתח ב${STAGE_LABEL[h.to]}`}</span>
              <span className="history__when num">{formatDateTime(h.at)}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

export function ProjectTasks() {
  const { project } = useProject();
  const { repos, now } = useStudio();
  const { announce } = useAnnouncer();
  const id = useId();
  const today = israelDate(now());
  const res = useResource((r) => r.tasks.listByProject(project.id), [project.id]);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('כתבו מה צריך לעשות.');
      return;
    }
    if (due && !isIsoDate(due)) {
      setError('התאריך לא תקין.');
      return;
    }
    setError(null);
    try {
      await repos.tasks.create({ projectId: project.id, title, dueDate: due || null });
      setTitle('');
      setDue('');
      announce('המשימה נוספה.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const toggle = async (taskId: string, done: boolean, label: string) => {
    try {
      await repos.tasks.setDone(taskId, done);
      announce(done ? `״${label}״ סומנה כבוצעה.` : `״${label}״ נפתחה מחדש.`);
    } catch (err) {
      announce(errorMessage(err), 'error');
    }
  };

  return (
    <div className="stack">
      <form className="inline-form" onSubmit={(e) => void add(e)} noValidate aria-label="הוספת משימה">
        <Field id={`${id}-t`} label="משימה חדשה" error={error} className="grow">
          <input
            id={`${id}-t`}
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(`${id}-t`, { error })}
          />
        </Field>
        <Field id={`${id}-d`} label="עד תאריך (רשות)">
          <input id={`${id}-d`} className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" icon="plus">
          הוספה
        </Button>
      </form>
      {res.status === 'loading' ? (
        <LoadingState label="טוען משימות…" />
      ) : res.status === 'error' ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : res.data.length === 0 ? (
        <EmptyState icon="flag" title="אין משימות">
          הוסיפו את הצעד הראשון בטופס שלמעלה.
        </EmptyState>
      ) : (
        <ul className="checklist" aria-label="משימות">
          {res.data.map((t) => {
            const late = !t.done && t.dueDate !== null && t.dueDate < today;
            return (
              <li key={t.id} className={`checklist__item${t.done ? ' is-done' : ''}`}>
                <label className="check">
                  <input type="checkbox" checked={t.done} onChange={(e) => void toggle(t.id, e.target.checked, t.title)} />
                  <span className="checklist__title">{t.title}</span>
                </label>
                {t.dueDate ? (
                  late ? (
                    <Badge tone="danger">באיחור · {formatDate(t.dueDate, { short: true })}</Badge>
                  ) : (
                    <span className="muted num small">{formatDate(t.dueDate, { short: true })}</span>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ProjectMilestones() {
  const { project } = useProject();
  const { repos, now } = useStudio();
  const { announce } = useAnnouncer();
  const id = useId();
  const today = israelDate(now());
  const res = useResource((r) => r.milestones.listByProject(project.id), [project.id]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!title.trim() || !isIsoDate(date)) {
      setError(!title.trim() ? 'צריך שם לאבן הדרך.' : 'בחרו תאריך.');
      return;
    }
    setError(null);
    try {
      await repos.milestones.create({ projectId: project.id, title, date, clientVisible: visible });
      setTitle('');
      setDate('');
      announce('אבן הדרך נוספה.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="stack">
      <form className="inline-form" onSubmit={(e) => void add(e)} noValidate aria-label="הוספת אבן דרך">
        <Field id={`${id}-t`} label="אבן דרך" className="grow" error={error}>
          <input id={`${id}-t`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-describedby={describedBy(`${id}-t`, { error })} />
        </Field>
        <Field id={`${id}-d`} label="תאריך">
          <input id={`${id}-d`} className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <label className="check check--inline">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          גלוי ללקוח
        </label>
        <Button type="submit" variant="primary" icon="plus">
          הוספה
        </Button>
      </form>
      {res.status === 'loading' ? (
        <LoadingState />
      ) : res.status === 'error' ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : res.data.length === 0 ? (
        <EmptyState icon="flag" title="אין אבני דרך">
          אבני דרך גלויות ללקוח יופיעו בפורטל שלו.
        </EmptyState>
      ) : (
        <ol className="milestones">
          {res.data.map((m) => (
            <li key={m.id} className={`milestone${m.done ? ' is-done' : ''}${!m.done && m.date < today ? ' is-late' : ''}`}>
              <span className="milestone__date num">{formatDate(m.date, { short: true })}</span>
              <span className="milestone__title">
                {m.title}
                {m.clientVisible ? <Badge tone="info">גלוי ללקוח</Badge> : null}
              </span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={m.done}
                  onChange={(e) => {
                    void repos.milestones.setDone(m.id, e.target.checked).then(
                      () => announce(e.target.checked ? 'אבן הדרך סומנה כהושלמה.' : 'אבן הדרך נפתחה מחדש.'),
                      (err: unknown) => announce(errorMessage(err), 'error'),
                    );
                  }}
                />
                <span>הושלם</span>
                <span className="visually-hidden">: {m.title}</span>
              </label>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const VERSION_TONE: Record<VersionStatus, Tone> = {
  draft: 'neutral',
  'awaiting-client': 'info',
  'changes-requested': 'warn',
  approved: 'ok',
};

export function ProjectFiles() {
  const { project } = useProject();
  const res = useResource(async (r) => ({ bundles: await r.assets.listByProject(project.id), deliveries: await r.assets.listDeliveries(project.id) }), [project.id]);
  if (res.status === 'loading') return <LoadingState label="טוען קבצים…" />;
  if (res.status === 'error') return <ErrorState error={res.error} onRetry={res.reload} />;
  const { bundles, deliveries } = res.data;
  if (bundles.length === 0) {
    return (
      <EmptyState icon="file" title="אין קבצים עדיין">
        העלאת קבצים וגרסאות תגיע עם ספק האחסון. בשלב הדמו הרשימה מוצגת מנתוני הדוגמה.
      </EmptyState>
    );
  }
  return (
    <div className="stack">
      {bundles.map(({ asset, versions }) => (
        <section key={asset.id} className="card" aria-labelledby={`as-${asset.id}`}>
          <header className="asset-head">
            <h2 id={`as-${asset.id}`} className="card__title">
              {asset.title}
            </h2>
            <span className="muted small">{ASSET_KIND_LABEL[asset.kind]}</span>
          </header>
          <ol className="versions">
            {versions.map((v) => {
              const open = v.comments.filter((c) => !c.resolved).length;
              return (
                <li key={v.id} className="version">
                  <div className="version__head">
                    <span className="version__num mono">v{v.number}</span>
                    <span className="version__file mono" dir="ltr">
                      {v.fileName}
                    </span>
                    <Badge tone={VERSION_TONE[v.status]}>{VERSION_STATUS_LABEL[v.status]}</Badge>
                  </div>
                  <p className="version__meta muted small">
                    <span className="num">{formatBytes(v.sizeBytes)}</span>
                    {v.durationMs !== null ? (
                      <>
                        {' · '}
                        <span className="num">{formatTimecode(v.durationMs)}</span>
                      </>
                    ) : null}
                    {' · '}
                    <span className="num">{formatDateTime(v.createdAt)}</span>
                    {v.note ? ` · ${v.note}` : ''}
                  </p>
                  {v.comments.length > 0 ? (
                    <details className="comments" open={open > 0}>
                      <summary>
                        {v.comments.length} הערות{open > 0 ? `, ${String(open)} פתוחות` : ''}
                      </summary>
                      <ul>
                        {v.comments.map((c) => (
                          <li key={c.id} className={`comment${c.resolved ? ' is-resolved' : ''}`}>
                            {c.timecodeMs !== null ? <span className="comment__tc mono">{formatTimecode(c.timecodeMs)}</span> : null}
                            <span className="comment__body">
                              <span className="comment__who">{c.author === 'client' ? 'לקוח' : 'את/ה'}:</span> {c.body}
                            </span>
                            {c.resolved ? (
                              <span className="comment__state">
                                <Icon name="check" size={14} /> טופל
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {deliveries.length > 0 ? (
        <section className="card card--ok" aria-labelledby="deliveries">
          <h2 id="deliveries" className="card__title">
            מסירות
          </h2>
          <ul className="item-list">
            {deliveries.map((d) => (
              <li key={d.id} className="item item--static">
                <span className="item__main">
                  <span className="item__title num">{formatDateTime(d.deliveredAt)}</span>
                  <span className="item__meta">{d.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
