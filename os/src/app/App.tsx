import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { ClientDetailPage, ClientsPage } from '../features/clients/ClientsPages';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { LeadDetailPage } from '../features/leads/LeadDetailPage';
import { LeadsPage } from '../features/leads/LeadsPage';
import { NotFoundPage, OutboxPage, PortalPlaceholder, SignInPage } from '../features/misc/OtherPages';
import { ProjectLayout } from '../features/projects/ProjectLayout';
import { ProjectFiles, ProjectMilestones, ProjectOverview, ProjectTasks } from '../features/projects/ProjectTabs';
import { ProjectsBoard } from '../features/projects/ProjectsBoard';
import { ProjectQuote } from '../features/projects/QuoteTab';
import { AppShell, DemoBanner } from './AppShell';
import { canAccess, homeFor, useSession } from './session';

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'היום'],
  [/^\/leads\/?$/, 'לידים'],
  [/^\/leads\/.+/, 'ליד'],
  [/^\/clients\/?$/, 'לקוחות'],
  [/^\/clients\/.+/, 'לקוח'],
  [/^\/projects\/?$/, 'פרויקטים'],
  [/^\/projects\/.+/, 'פרויקט'],
  [/^\/outbox/, 'תיבת יוצאים'],
  [/^\/portal/, 'פורטל לקוח'],
  [/^\/sign-in/, 'כניסה'],
];

/**
 * Page title per route. When the top-level section changes (not on first load, not between tabs
 * of the same project), focus moves to <main> so screen-reader and keyboard users start at the
 * new content instead of the old link.
 */
function RouteEffects() {
  const { pathname, search } = useLocation();
  const prevSection = useRef<string | null>(null);
  useEffect(() => {
    const t = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'לא נמצא';
    document.title = `${t} · Studio OS (דמו)`;
    const section = pathname.split('/').slice(0, 3).join('/');
    const changed = prevSection.current !== null && prevSection.current !== section;
    prevSection.current = section;
    if (changed && !new URLSearchParams(search).has('focus')) {
      document.getElementById('main')?.focus({ preventScroll: false });
    }
  }, [pathname, search]);
  return null;
}

function Chrome() {
  return (
    <>
      <a className="skip-link" href="#main">
        דילוג לתוכן
      </a>
      <DemoBanner />
    </>
  );
}

function Guard({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { pathname } = useLocation();
  if (!canAccess(session?.role ?? null, pathname)) {
    return <Navigate to={session ? homeFor(session.role) : '/sign-in'} replace state={{ from: pathname }} />;
  }
  return children;
}

export function App() {
  const { session } = useSession();
  if (session?.role === 'client') {
    // Clients only ever get the portal (and sign-in). Everything else redirects.
    return (
      <>
        <RouteEffects />
        <Chrome />
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/portal" element={<PortalPlaceholder />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </>
    );
  }
  return (
    <>
      <RouteEffects />
      <Chrome />
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route
          element={
            <Guard>
              <AppShell />
            </Guard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/:leadId" element={<LeadDetailPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:clientId" element={<ClientDetailPage />} />
          <Route path="projects" element={<ProjectsBoard />} />
          <Route path="projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<ProjectOverview />} />
            <Route path="tasks" element={<ProjectTasks />} />
            <Route path="milestones" element={<ProjectMilestones />} />
            <Route path="files" element={<ProjectFiles />} />
            <Route path="quote" element={<ProjectQuote />} />
          </Route>
          <Route path="outbox" element={<OutboxPage />} />
          <Route path="portal" element={<PortalPlaceholder />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
