import { Link } from 'react-router';
import { useResource, useStudio } from '../../app/StudioContext';
import { computeAttention } from '../../domain/attention';
import { formatDate, relativeDay } from '../../domain/dates';
import { NEED_LABEL } from '../../domain/lead';
import { VERSION_STATUS_LABEL } from '../../domain/labels';
import { formatTimecode } from '../../domain/timecode';
import { Icon, type IconName } from '../../ui/Icon';
import { Badge, ErrorState, LoadingState, Money, PageHeader } from '../../ui/primitives';
import type { ReactNode } from 'react';

function Panel({
  id,
  icon,
  title,
  count,
  summary,
  link,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  count: number;
  summary?: ReactNode;
  link?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className={`panel${count === 0 ? ' panel--clear' : ''}`} aria-labelledby={id}>
      <header className="panel__head">
        <span className="panel__icon">
          <Icon name={icon} />
        </span>
        <h2 id={id} className="panel__title">
          {title}
        </h2>
        <span className="panel__count num" aria-hidden="true">
          {count}
        </span>
      </header>
      {summary ? <p className="panel__summary">{summary}</p> : null}
      <div className="panel__body">{children}</div>
      {link ? (
        <Link className="panel__more" to={link.to}>
          {link.label}
          <Icon name="chevronEnd" size={16} />
        </Link>
      ) : null}
    </section>
  );
}

function Clear({ children }: { children: ReactNode }) {
  return (
    <p className="panel__clear">
      <Icon name="check" size={16} />
      {children}
    </p>
  );
}

export function DashboardPage() {
  const { now } = useStudio();
  const res = useResource(async (repos) => {
    const snap = await repos.snapshot();
    return { snap, attention: computeAttention(snap, now()) };
  }, []);

  if (res.status === 'loading') {
    return (
      <>
        <PageHeader eyebrow="היום" title="מה מחכה לך" />
        <LoadingState label="טוען את סדר היום…" rows={6} />
      </>
    );
  }
  if (res.status === 'error') {
    return (
      <>
        <PageHeader eyebrow="היום" title="מה מחכה לך" />
        <ErrorState error={res.error} onRetry={res.reload} />
      </>
    );
  }

  const { snap, attention: a } = res.data;
  const projectTitle = (id: string) => snap.projects.find((p) => p.id === id)?.title ?? 'פרויקט';
  const clientName = (id: string) => snap.clients.find((c) => c.id === id)?.name ?? 'לקוח';

  const headline =
    a.totalItems === 0 ? 'הכול רגוע. אין שום דבר דחוף היום.' : `${String(a.totalItems)} דברים מחכים לך. מתחילים מהלידים, הם הכי רגישים לזמן.`;

  return (
    <>
      <PageHeader eyebrow={formatDate(a.today)} title="מה מחכה לך היום" description={headline} />

      <div className="dash-grid">
        <Panel
          id="dash-leads"
          icon="inbox"
          title="לידים חדשים"
          count={a.newLeads.length}
          summary={a.newLeads.length > 0 ? 'מהוותיק לחדש. פנייה שנענית ביום הראשון נסגרת הרבה יותר.' : undefined}
          link={{ to: '/leads', label: 'לכל הלידים' }}
        >
          {a.newLeads.length === 0 ? (
            <Clear>אין לידים שמחכים לתשובה.</Clear>
          ) : (
            <ul className="item-list">
              {a.newLeads.map((lead) => (
                <li key={lead.id}>
                  <Link className="item" to={`/leads/${lead.id}`}>
                    <span className="item__main">
                      <span className="item__title">{lead.name}</span>
                      <span className="item__meta">
                        {NEED_LABEL[lead.need]} · {relativeDay(lead.receivedAt.slice(0, 10), a.today)}
                      </span>
                    </span>
                    <Badge tone="accent">חדש</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="dash-reviews"
          icon="clock"
          title="הערות לקוח שמחכות לך"
          count={a.reviews.length}
          summary={
            a.awaitingClient === 1
              ? 'ועוד גרסה אחת אצל לקוח, ממתינה להערות שלו.'
              : a.awaitingClient > 1
                ? `ועוד ${String(a.awaitingClient)} גרסאות אצל לקוחות, ממתינות להערות שלהם.`
                : undefined
          }
        >
          {a.reviews.length === 0 ? (
            <Clear>אין הערות פתוחות.</Clear>
          ) : (
            <ul className="item-list">
              {a.reviews.map((r) => {
                const first = snap.comments.find((c) => c.versionId === r.version.id && !c.resolved && c.author === 'client');
                return (
                  <li key={r.version.id}>
                    <Link className="item" to={`/projects/${r.project.id}/files`}>
                      <span className="item__main">
                        <span className="item__title">
                          {r.asset.title} · גרסה {r.version.number}
                        </span>
                        <span className="item__meta">
                          {r.project.title}
                          {first?.timecodeMs != null ? ` · ${formatTimecode(first.timecodeMs)}` : ''}
                        </span>
                      </span>
                      <Badge tone={r.reason === 'changes-requested' ? 'warn' : 'info'}>
                        {r.openComments > 0 ? `${String(r.openComments)} הערות` : VERSION_STATUS_LABEL[r.version.status]}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          id="dash-tasks"
          icon="flag"
          title="משימות באיחור"
          count={a.overdueTasks.length}
          summary={
            a.dueToday.length === 1 ? 'ועוד משימה אחת לביצוע היום.' : a.dueToday.length > 1 ? `ועוד ${String(a.dueToday.length)} משימות לביצוע היום.` : undefined
          }
          link={{ to: '/projects', label: 'ללוח הפרויקטים' }}
        >
          {a.overdueTasks.length === 0 ? (
            <Clear>אין משימות באיחור.</Clear>
          ) : (
            <ul className="item-list">
              {a.overdueTasks.map(({ task, daysLate }) => (
                <li key={task.id}>
                  <Link className="item" to={`/projects/${task.projectId}/tasks`}>
                    <span className="item__main">
                      <span className="item__title">{task.title}</span>
                      <span className="item__meta">{projectTitle(task.projectId)}</span>
                    </span>
                    <Badge tone="danger">{daysLate === 1 ? 'יום באיחור' : `${String(daysLate)} ימים באיחור`}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          id="dash-money"
          icon="money"
          title="הצעות שלא שולמו"
          count={a.unpaidQuotes.length}
          summary={
            a.unpaidTotal > 0 ? (
              <>
                יתרה פתוחה: <Money agorot={a.unpaidTotal} className="strong" /> כולל מע״מ
              </>
            ) : undefined
          }
        >
          {a.unpaidQuotes.length === 0 ? (
            <Clear>כל ההצעות שאושרו שולמו.</Clear>
          ) : (
            <ul className="item-list">
              {a.unpaidQuotes.map(({ quote, due }) => (
                <li key={quote.id}>
                  <Link className="item" to={`/projects/${quote.projectId}/quote`}>
                    <span className="item__main">
                      <span className="item__title">{clientName(quote.clientId)}</span>
                      <span className="item__meta">
                        <span className="mono">{quote.number}</span> · {projectTitle(quote.projectId)}
                      </span>
                    </span>
                    <Money agorot={due} compact className="item__amount" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section className="upcoming" aria-labelledby="dash-upcoming">
        <h2 id="dash-upcoming" className="section-title">
          אבני דרך בשבוע הקרוב
        </h2>
        {a.upcomingMilestones.length === 0 ? (
          <p className="muted">אין אבני דרך בשבוע הקרוב.</p>
        ) : (
          <ol className="timeline">
            {a.upcomingMilestones.map((m) => (
              <li key={m.id} className="timeline__item">
                <span className="timeline__date">{relativeDay(m.date, a.today)}</span>
                <Link to={`/projects/${m.projectId}/milestones`} className="timeline__link">
                  {m.title}
                </Link>
                <span className="timeline__meta">{projectTitle(m.projectId)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
