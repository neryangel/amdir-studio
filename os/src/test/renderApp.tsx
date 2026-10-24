import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../app/App';
import { AnnouncerProvider } from '../app/announcer';
import { createDemoStudio } from '../app/bootstrap';
import { SESSION_KEY, SessionProvider, type Session } from '../app/session';
import { StudioProvider, type Studio } from '../app/StudioContext';
import { createMemoryStorage } from '../data/storage';

export const TEST_NOW = '2026-10-24T07:00:00.000Z';

export function renderApp(path: string, opts: { session?: Session | null; studio?: (s: Studio) => Studio } = {}) {
  const storage = createMemoryStorage();
  const session = opts.session === undefined ? { role: 'owner', displayName: 'נריה', clientId: null } : opts.session;
  if (session) storage.setItem(SESSION_KEY, JSON.stringify(session));
  const base = createDemoStudio(storage, () => TEST_NOW);
  const studio = opts.studio ? opts.studio(base) : base;
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <StudioProvider studio={studio}>
        <SessionProvider storage={storage}>
          <AnnouncerProvider>
            <App />
          </AnnouncerProvider>
        </SessionProvider>
      </StudioProvider>
    </MemoryRouter>,
  );
  return { ...utils, user, studio, storage };
}
