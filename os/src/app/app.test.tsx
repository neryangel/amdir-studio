import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { canAccess, homeFor, readSession, SESSION_KEY } from './session';
import { createMemoryStorage } from '../data/storage';
import { parseDraftLines } from '../features/projects/QuoteTab';

describe('mock session and role access', () => {
  it('clients reach only the portal; owners everything; nobody without a session', () => {
    expect(canAccess('client', '/portal')).toBe(true);
    expect(canAccess('client', '/projects')).toBe(false);
    expect(canAccess('client', '/')).toBe(false);
    expect(canAccess('owner', '/projects/x/quote')).toBe(true);
    expect(canAccess(null, '/')).toBe(false);
    expect(canAccess(null, '/sign-in')).toBe(true);
    expect(homeFor('client')).toBe('/portal');
    expect(homeFor(null)).toBe('/sign-in');
  });
  it('ignores corrupt or incomplete sessions', () => {
    const s = createMemoryStorage();
    s.setItem(SESSION_KEY, '{nope');
    expect(readSession(s)).toBeNull();
    s.setItem(SESSION_KEY, JSON.stringify({ role: 'client' }));
    expect(readSession(s)).toBeNull();
    s.setItem(SESSION_KEY, JSON.stringify({ role: 'admin' }));
    expect(readSession(s)).toBeNull();
    s.setItem(SESSION_KEY, JSON.stringify({ role: 'owner' }));
    expect(readSession(s)?.role).toBe('owner');
  });
  it('redirects to sign-in without a session, and a client to the portal', async () => {
    renderApp('/projects', { session: null });
    expect(await screen.findByRole('heading', { level: 1, name: 'כניסה לדמו' })).toBeInTheDocument();
  });
  it('client role never sees owner screens', async () => {
    renderApp('/projects', { session: { role: 'client', displayName: 'לקוח לדוגמה א׳', clientId: 'demo-cli-a' } });
    expect(await screen.findByRole('heading', { level: 1, name: /שלום, לקוח לדוגמה א׳/ })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'ראשי' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'מצב דמו' })).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('shows a designed loading state, then the computed attention panels', async () => {
    renderApp('/');
    expect(screen.getByText('טוען את סדר היום…')).toBeInTheDocument();
    const leads = await screen.findByRole('region', { name: 'לידים חדשים' });
    expect(within(leads).getAllByRole('link').map((a) => a.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('פונה לדוגמה ד׳'), expect.stringContaining('עסק לדוגמה ה׳')]),
    );
    expect(within(screen.getByRole('region', { name: 'משימות באיחור' })).getAllByText(/באיחור/).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'הצעות שלא שולמו' })).toHaveTextContent('22,656.00');
  });
  it('shows a retryable error state when loading fails', async () => {
    let fail = true;
    const { user } = renderApp('/', {
      studio: (s) => ({
        ...s,
        repos: {
          ...s.repos,
          snapshot: () => (fail ? Promise.reject(new Error('network')) : s.repos.snapshot()),
        },
      }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לטעון את הנתונים');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'ניסיון נוסף' }));
    expect(await screen.findByRole('region', { name: 'לידים חדשים' })).toBeInTheDocument();
  });
  it('one-click demo reset restores the seed', async () => {
    const { user, studio } = renderApp('/');
    await screen.findByRole('region', { name: 'לידים חדשים' });
    await studio.repos.leads.setStatus('demo-lead-1', 'spam');
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'לידים חדשים' })).queryByText('פונה לדוגמה ד׳')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'איפוס נתוני דמו' }));
    expect(await within(screen.getByRole('region', { name: 'לידים חדשים' })).findByText('פונה לדוגמה ד׳')).toBeInTheDocument();
    expect(await screen.findByText('נתוני הדמו אופסו למצב ההתחלתי.')).toBeInTheDocument();
  });
});

describe('projects board (keyboard-operable)', () => {
  it('moves a card one stage with a button and keeps focus on the moved card', async () => {
    const { user } = renderApp('/projects');
    const inquiry = await screen.findByRole('region', { name: /^פנייה/ });
    const card = within(inquiry).getByRole('listitem');
    within(card).getByRole('button', { name: 'העברה לשלב הצעה' }).focus();
    await user.keyboard('{Enter}');
    const proposal = screen.getByRole('region', { name: /^הצעה/ });
    await waitFor(() => expect(within(proposal).getByRole('link', { name: 'טיזר לאירוע השקה' })).toBeInTheDocument());
    const moved = within(proposal)
      .getAllByRole('listitem')
      .find((li) => within(li).queryByRole('link', { name: 'טיזר לאירוע השקה' }));
    if (!moved) throw new Error('moved card not found');
    await waitFor(() => expect(within(moved).getByRole('button', { name: 'העברה לשלב טרום הפקה' })).toHaveFocus());
    expect(await screen.findByText('״טיזר לאירוע השקה״ הועבר לשלב הצעה.')).toBeInTheDocument();
  });
  it('lead conversion lands on the board with the new card focused', async () => {
    const { user } = renderApp('/leads/demo-lead-2');
    const form = await screen.findByRole('form', { name: 'המרה ללקוח ולפרויקט' });
    const title = within(form).getByLabelText('שם הפרויקט');
    await user.clear(title);
    await user.click(within(form).getByRole('button', { name: 'המרה ללקוח ופרויקט' }));
    expect(await within(form).findByText('צריך שם לפרויקט.')).toBeInTheDocument();
    expect(title).toHaveFocus();
    await user.type(title, 'אתר חדש');
    await user.click(within(form).getByRole('button', { name: 'המרה ללקוח ופרויקט' }));
    const inquiry = await screen.findByRole('region', { name: /^פנייה/ });
    await waitFor(() => expect(within(inquiry).getByRole('link', { name: 'אתר חדש' })).toHaveFocus());
  });
});

describe('quote builder', () => {
  it('parses draft rows strictly', () => {
    const { lines, errors } = parseDraftLines([
      { id: 'a', description: 'x', quantity: '1.5', unitPrice: '1,000' },
      { id: 'b', description: 'y', quantity: '0', unitPrice: '10' },
      { id: 'c', description: 'z', quantity: '1.234', unitPrice: 'abc' },
    ]);
    expect(lines).toEqual([{ id: 'a', description: 'x', quantity: 1.5, unitPrice: 100_000 }]);
    expect(Object.keys(errors)).toEqual(['b', 'c']);
    expect(errors['c']?.unitPrice).toBeDefined();
  });
  it('updates totals live, including VAT, and flags an excessive discount', async () => {
    const { user } = renderApp('/projects/demo-prj-5/quote');
    const form = await screen.findByRole('form', { name: /עריכת הצעה/ });
    const output = form.querySelector('output');
    expect(output).toHaveTextContent('6,136.00');
    const qty = within(form).getByLabelText('כמות, שורה 1');
    await user.clear(qty);
    await user.type(qty, '10');
    expect(output).toHaveTextContent('7,670.00'); // 6,500 + 1,170
    await user.click(within(form).getByRole('button', { name: 'הוספת שורה' }));
    await waitFor(() => expect(within(form).getByLabelText('תיאור שורה 2')).toHaveFocus());
    await user.type(within(form).getByLabelText('מחיר ליחידה בשקלים, שורה 2'), '{Backspace}500.5');
    expect(output).toHaveTextContent('8,260.59'); // 7,000.50 net → 1,260.09 VAT
    const discount = within(form).getByLabelText('הנחה (₪, לפני מע״מ)');
    await user.clear(discount);
    await user.type(discount, '99999');
    expect(within(form).getByText('ההנחה גדולה מסכום ההצעה.')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'שמירת טיוטה' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('יש שדות לא תקינים');
  });
});
