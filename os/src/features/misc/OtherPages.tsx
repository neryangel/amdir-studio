import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAnnouncer } from '../../app/announcer';
import { useOutbox, useResource, useStudio } from '../../app/StudioContext';
import { homeFor, useSession } from '../../app/session';
import { formatDateTime } from '../../domain/dates';
import type { ProviderName } from '../../providers/outbox';
import { Icon, type IconName } from '../../ui/Icon';
import { Badge, Button, ButtonLink, EmptyState, LoadingState, PageHeader } from '../../ui/primitives';

const PROVIDER_META: Record<ProviderName, { label: string; icon: IconName }> = {
  email: { label: 'אימייל', icon: 'outbox' },
  storage: { label: 'אחסון', icon: 'file' },
  video: { label: 'וידאו', icon: 'clock' },
  payment: { label: 'תשלום', icon: 'money' },
  invoicing: { label: 'חשבונית', icon: 'file' },
};

export function OutboxPage() {
  const entries = useOutbox();
  const { outbox } = useStudio();
  const { announce } = useAnnouncer();
  return (
    <>
      <PageHeader
        eyebrow="ספקים מדומים"
        title="תיבת יוצאים"
        description="כל מה שהמערכת הייתה שולחת לספק אמיתי: מיילים, קישורי תשלום, חשבוניות והעלאות. בדמו שום דבר לא יוצא מהדפדפן."
        actions={
          entries.length > 0 ? (
            <Button
              variant="ghost"
              icon="trash"
              onClick={() => {
                outbox.clear();
                announce('תיבת היוצאים רוקנה.');
              }}
            >
              ריקון
            </Button>
          ) : null
        }
      />
      {entries.length === 0 ? (
        <EmptyState icon="outbox" title="התיבה ריקה">
          שלחו הצעת מחיר, צרו קישור תשלום או הפיקו חשבונית, והבקשה תופיע כאן.
        </EmptyState>
      ) : (
        <ol className="outbox">
          {entries.map((e) => (
            <li key={e.id} className="outbox__item">
              <span className="outbox__icon">
                <Icon name={PROVIDER_META[e.provider].icon} />
              </span>
              <div className="outbox__main">
                <p className="outbox__summary">{e.summary}</p>
                <p className="muted small">
                  <Badge>{PROVIDER_META[e.provider].label}</Badge> <span className="mono">{e.action}</span> · <span className="num">{formatDateTime(e.at)}</span>
                </p>
                <details>
                  <summary>הבקשה המלאה</summary>
                  <pre className="code" dir="ltr">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </details>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export function PortalPlaceholder() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const res = useResource(async (r) => (session?.clientId ? r.clients.get(session.clientId) : null), [session?.clientId]);
  const isClient = session?.role === 'client';
  const body = (
    <section className="portal-card" aria-labelledby="portal-h">
      <p className="eyebrow">פורטל לקוח</p>
      <h1 id="portal-h">{res.status === 'ready' && res.data ? `שלום, ${res.data.name}` : 'הפורטל בדרך'}</h1>
      {res.status === 'loading' && isClient ? <LoadingState rows={2} /> : null}
      <p>
        כאן הלקוח יראה את הפרויקטים שלו, יצפה בגרסאות, ישאיר הערות על ציר הזמן, יאשר הצעות מחיר וישלם. זה השלב הבא בבנייה.
      </p>
      <ul className="portal-list">
        <li>רק הנתונים של הלקוח עצמו (ב-Supabase: RLS לפי מזהה הלקוח)</li>
        <li>צפייה בגרסאות דרך קישורים חתומים, לא קבצים ציבוריים</li>
        <li>הערות עם קוד זמן ואישור גרסה</li>
      </ul>
      <div className="form-actions">
        {isClient ? (
          <Button
            icon="logout"
            onClick={() => {
              signOut();
              void navigate('/sign-in');
            }}
          >
            יציאה
          </Button>
        ) : (
          <ButtonLink to="/" icon="chevronStart">
            חזרה למערכת
          </ButtonLink>
        )}
      </div>
    </section>
  );
  if (isClient) {
    return (
      <main id="main" className="portal-shell">
        {body}
      </main>
    );
  }
  return body;
}

export function SignInPage() {
  const { session, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [clientId] = useState('demo-cli-a');
  if (session) return <Navigate to={homeFor(session.role)} replace />;
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <main id="main" className="signin">
      <div className="signin__card">
        <p className="brand brand--static">
          <span className="brand__mark" aria-hidden="true">
            A
          </span>
          <span className="brand__text">
            <span className="brand__name">AMDIR</span>
            <span className="brand__product">Studio OS</span>
          </span>
        </p>
        <h1>כניסה לדמו</h1>
        <p className="muted">אין כאן סיסמה: זו כניסה מדומה. כניסה אמיתית תגיע עם Supabase Auth.</p>
        <div className="signin__choices">
          <button
            type="button"
            className="choice"
            onClick={() => {
              signIn({ role: 'owner', displayName: 'נריה', clientId: null });
              void navigate(from && from !== '/portal' ? from : '/', { replace: true });
            }}
          >
            <span className="choice__title">כניסה כבעלי הסטודיו</span>
            <span className="choice__text">לידים, לקוחות, פרויקטים, הצעות מחיר</span>
          </button>
          <button
            type="button"
            className="choice"
            onClick={() => {
              signIn({ role: 'client', displayName: 'לקוח לדוגמה א׳', clientId });
              void navigate('/portal', { replace: true });
            }}
          >
            <span className="choice__title">כניסה כלקוח לדוגמה</span>
            <span className="choice__text">רואה רק את פורטל הלקוח</span>
          </button>
        </div>
        <p className="demo-note small">
          <Badge tone="warn">מצב דמו</Badge> כל הנתונים לדוגמה.
        </p>
      </div>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <>
      <PageHeader eyebrow="404" title="העמוד לא נמצא" />
      <EmptyState icon="alert" title="אין כאן כלום" action={<ButtonLink to="/" variant="primary">לעמוד הבית</ButtonLink>}>
        ייתכן שהקישור ישן, או שנתוני הדמו אופסו.
      </EmptyState>
    </>
  );
}
