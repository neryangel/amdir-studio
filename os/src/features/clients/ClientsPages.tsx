import { useId, useState, type SubmitEvent } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage, useAnnouncer } from '../../app/announcer';
import { useResource, useStudio } from '../../app/StudioContext';
import { PROJECT_KIND_LABEL } from '../../domain/labels';
import { QUOTE_STATUS_LABEL, balanceDue, quoteTotals } from '../../domain/quote';
import { STAGE_LABEL } from '../../domain/stages';
import type { Client } from '../../domain/types';
import { Badge, Button, ButtonLink, DemoTag, EmptyState, ErrorState, Field, LoadingState, Money, PageHeader } from '../../ui/primitives';

export function ClientsPage() {
  const res = useResource(async (r) => {
    const [clients, snap] = await Promise.all([r.clients.list(), r.snapshot()]);
    return clients.map((c) => {
      const projects = snap.projects.filter((p) => p.clientId === c.id);
      const quotes = snap.quotes.filter((q) => q.clientId === c.id);
      return {
        client: c,
        active: projects.filter((p) => p.stage !== 'archived' && p.stage !== 'delivered').length,
        total: projects.length,
        billed: quotes.filter((q) => q.status === 'accepted').reduce((acc, q) => acc + quoteTotals(q).total, 0),
        due: quotes.reduce((acc, q) => acc + balanceDue(q), 0),
      };
    });
  }, []);

  const header = <PageHeader eyebrow="ספר לקוחות" title="לקוחות" description="כל לקוח, הפרויקטים שלו והכסף הפתוח מולו." />;
  if (res.status === 'loading') return (<>{header}<LoadingState label="טוען לקוחות…" /></>);
  if (res.status === 'error') return (<>{header}<ErrorState error={res.error} onRetry={res.reload} /></>);
  if (res.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon="users" title="עוד אין לקוחות" action={<ButtonLink to="/leads" variant="primary">ללידים</ButtonLink>}>
          לקוחות נוצרים כשממירים ליד.
        </EmptyState>
      </>
    );
  }
  return (
    <>
      {header}
      <ul className="row-list">
        {res.data.map(({ client, active, total, billed, due }) => (
          <li key={client.id} className="row">
            <div className="row__main">
              <Link to={`/clients/${client.id}`} className="row__title stretched">
                {client.name}
              </Link>
              <p className="row__excerpt">{client.company ?? 'לקוח פרטי'}</p>
            </div>
            <div className="row__meta">
              <span>
                <span className="num">{active}</span> פעילים מתוך <span className="num">{total}</span>
              </span>
              <span className="muted">
                אושר: <Money agorot={billed} compact />
              </span>
            </div>
            <div className="row__end">{due > 0 ? <Badge tone="warn">פתוח <Money agorot={due} compact /></Badge> : <Badge tone="ok">אין חוב</Badge>}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ClientEditor({ client }: { client: Client }) {
  const { repos } = useStudio();
  const { announce } = useAnnouncer();
  const id = useId();
  const [notes, setNotes] = useState(client.notes);
  const [portal, setPortal] = useState(client.portalEnabled);
  const [busy, setBusy] = useState(false);
  const dirty = notes !== client.notes || portal !== client.portalEnabled;
  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await repos.clients.update(client.id, { notes, portalEnabled: portal });
      announce('פרטי הלקוח נשמרו.');
    } catch (err) {
      announce(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={(e) => void save(e)} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="card__title">
        הערות וגישה
      </h2>
      <Field id={`${id}-notes`} label="הערות פנימיות" hint="רק לך. הלקוח לא רואה אותן.">
        <textarea id={`${id}-notes`} className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} aria-describedby={`${id}-notes-hint`} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
        גישה לפורטל הלקוח
      </label>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={!dirty || busy} busy={busy}>
          שמירה
        </Button>
      </div>
    </form>
  );
}

export function ClientDetailPage() {
  const { clientId = '' } = useParams();
  const res = useResource(
    async (r) => ({
      client: await r.clients.get(clientId),
      projects: await r.projects.listByClient(clientId),
      quotes: (await r.quotes.listAll()).filter((q) => q.clientId === clientId),
    }),
    [clientId],
  );
  const back = (
    <ButtonLink to="/clients" variant="ghost" size="sm" icon="chevronStart">
      חזרה ללקוחות
    </ButtonLink>
  );
  if (res.status === 'loading') return (<>{back}<LoadingState label="טוען לקוח…" /></>);
  if (res.status === 'error') return (<>{back}<ErrorState error={res.error} onRetry={res.reload} /></>);
  const { client, projects, quotes } = res.data;
  if (!client) return (<>{back}<ErrorState title="הלקוח לא נמצא" /></>);

  return (
    <>
      {back}
      <PageHeader eyebrow={<>לקוח {client.demo ? <DemoTag /> : null}</>} title={client.name} description={client.company ?? 'לקוח פרטי'} />
      <div className="detail-grid">
        <div className="stack">
          <section className="card" aria-labelledby="cl-projects">
            <h2 id="cl-projects" className="card__title">
              פרויקטים
            </h2>
            {projects.length === 0 ? (
              <p className="muted">אין פרויקטים ללקוח הזה.</p>
            ) : (
              <ul className="item-list">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link className="item" to={`/projects/${p.id}`}>
                      <span className="item__main">
                        <span className="item__title">{p.title}</span>
                        <span className="item__meta">{PROJECT_KIND_LABEL[p.kind]}</span>
                      </span>
                      <Badge tone={p.stage === 'archived' ? 'neutral' : p.stage === 'delivered' ? 'ok' : 'info'}>{STAGE_LABEL[p.stage]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card" aria-labelledby="cl-quotes">
            <h2 id="cl-quotes" className="card__title">
              הצעות מחיר
            </h2>
            {quotes.length === 0 ? (
              <p className="muted">אין הצעות מחיר.</p>
            ) : (
              <table className="table">
                <caption className="visually-hidden">הצעות מחיר של {client.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">מספר</th>
                    <th scope="col">סטטוס</th>
                    <th scope="col" className="num-col">
                      סה״כ כולל מע״מ
                    </th>
                    <th scope="col" className="num-col">
                      יתרה
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <Link className="link mono" to={`/projects/${q.projectId}/quote`}>
                          {q.number}
                        </Link>
                      </td>
                      <td>{QUOTE_STATUS_LABEL[q.status]}</td>
                      <td className="num-col">
                        <Money agorot={quoteTotals(q).total} />
                      </td>
                      <td className="num-col">
                        <Money agorot={balanceDue(q)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
        <aside className="stack" aria-label="פרטי הלקוח">
          <section className="card" aria-labelledby="cl-contact">
            <h2 id="cl-contact" className="card__title">
              פרטים
            </h2>
            <dl className="kv kv--compact">
              <div className="kv__row">
                <dt>אימייל</dt>
                <dd dir="ltr">{client.email ? <a className="link" href={`mailto:${client.email}`}>{client.email}</a> : '—'}</dd>
              </div>
              <div className="kv__row">
                <dt>טלפון</dt>
                <dd dir="ltr">{client.phone ?? '—'}</dd>
              </div>
              <div className="kv__row">
                <dt>ח.פ. / ע.מ.</dt>
                <dd className="mono">{client.taxId ?? 'לקוח פרטי'}</dd>
              </div>
              {client.sourceLeadId ? (
                <div className="kv__row">
                  <dt>מקור</dt>
                  <dd>
                    <Link className="link" to={`/leads/${client.sourceLeadId}`}>
                      הליד המקורי
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
          <ClientEditor key={client.updatedAt} client={client} />
        </aside>
      </div>
    </>
  );
}
