import { useEffect, useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Icon, type IconName } from '../ui/Icon';
import { useAnnouncer } from './announcer';
import { useOutbox, useResource, useStudio } from './StudioContext';
import { useSession } from './session';

/** Persistent on every screen (owner, client portal, sign-in). */
export function DemoBanner() {
  const { repos, outbox } = useStudio();
  const { announce } = useAnnouncer();
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      await repos.resetDemo();
      outbox.clear();
      announce('נתוני הדמו אופסו למצב ההתחלתי.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="demo-banner" role="region" aria-label="מצב דמו">
      <p className="demo-banner__text">
        <strong className="demo-banner__label">מצב דמו</strong>
        <span className="demo-banner__long">כל הנתונים כאן לדוגמה. שום מייל, תשלום או חשבונית לא נשלחים באמת; הכול נרשם בתיבת היוצאים.</span>
        <span className="demo-banner__short">נתוני דוגמה. שום דבר לא נשלח באמת.</span>
        {!repos.isPersistent() ? <span className="demo-banner__warn">הדפדפן חוסם שמירה מקומית: שינויים יימחקו ברענון.</span> : null}
      </p>
      <button type="button" className="demo-banner__reset" onClick={() => void reset()} disabled={busy} aria-busy={busy || undefined}>
        <Icon name="refresh" size={16} />
        איפוס נתוני דמו
      </button>
    </div>
  );
}

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
  readonly end?: boolean;
  readonly count?: number;
}

function useNavCounts() {
  const res = useResource(async (repos) => {
    const leads = await repos.leads.list();
    return { newLeads: leads.filter((l) => l.status === 'new').length };
  }, []);
  return res.status === 'ready' ? res.data : { newLeads: 0 };
}

export function AppShell() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navId = useId();
  const counts = useNavCounts();
  const outboxCount = useOutbox().length;

  // Close the mobile menu on navigation.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const items: NavItem[] = [
    { to: '/', label: 'היום', icon: 'home', end: true },
    { to: '/leads', label: 'לידים', icon: 'inbox', count: counts.newLeads },
    { to: '/projects', label: 'פרויקטים', icon: 'board' },
    { to: '/clients', label: 'לקוחות', icon: 'users' },
    { to: '/outbox', label: 'תיבת יוצאים', icon: 'outbox', count: outboxCount },
    { to: '/portal', label: 'פורטל לקוח', icon: 'portal' },
  ];

  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar__top">
            <Link className="brand" to="/">
              <span className="brand__mark" aria-hidden="true">A</span>
              <span className="brand__text">
                <span className="brand__name">AMDIR</span>
                <span className="brand__product">Studio OS</span>
              </span>
            </Link>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={menuOpen}
              aria-controls={navId}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} />
              <span>{menuOpen ? 'סגירה' : 'תפריט'}</span>
            </button>
          </div>
          <nav id={navId} className={`nav${menuOpen ? ' is-open' : ''}`} aria-label="ראשי">
            <ul>
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end ?? false} className="nav__link">
                    <Icon name={item.icon} />
                    <span className="nav__label">{item.label}</span>
                    {item.count ? (
                      <>
                        <span className="nav__count num" aria-hidden="true">
                          {item.count}
                        </span>
                        <span className="visually-hidden">{` (${String(item.count)})`}</span>
                      </>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="nav__footer">
              <p className="nav__who">
                <span className="nav__who-name">{session?.displayName}</span>
                <span className="nav__who-role">בעלים · כניסת דמו</span>
              </p>
              <button
                type="button"
                className="nav__signout"
                onClick={() => {
                  signOut();
                  void navigate('/sign-in');
                }}
              >
                <Icon name="logout" size={16} />
                יציאה
              </button>
            </div>
          </nav>
        </aside>
        <main id="main" className="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
