import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { KeyValueStorage } from '../data/storage';

/**
 * MOCK session. There is no password and no server: the demo lets you pick a role.
 * Real auth arrives with Supabase Auth + RLS (see README.he.md). The rest of the app only
 * reads `session.role` / `session.clientId`, so swapping the source changes nothing else.
 */
export type Role = 'owner' | 'client';

export interface Session {
  readonly role: Role;
  readonly displayName: string;
  /** For role=client: the only client whose data the portal may show. */
  readonly clientId: string | null;
}

export const SESSION_KEY = 'studio-os:session';

export function readSession(storage: KeyValueStorage): Session | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Session>;
    if (v.role === 'owner') return { role: 'owner', displayName: v.displayName ?? 'נריה', clientId: null };
    if (v.role === 'client' && typeof v.clientId === 'string') {
      return { role: 'client', displayName: v.displayName ?? 'לקוח', clientId: v.clientId };
    }
    return null;
  } catch {
    return null;
  }
}

interface SessionApi {
  readonly session: Session | null;
  readonly signIn: (session: Session) => void;
  readonly signOut: () => void;
}

const SessionCtx = createContext<SessionApi | null>(null);

export function SessionProvider({ storage, children }: { storage: KeyValueStorage; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession(storage));
  const signIn = useCallback(
    (s: Session) => {
      storage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
    },
    [storage],
  );
  const signOut = useCallback(() => {
    storage.removeItem(SESSION_KEY);
    setSession(null);
  }, [storage]);
  const api = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <SessionCtx value={api}>{children}</SessionCtx>;
}

export function useSession(): SessionApi {
  const s = use(SessionCtx);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}

/** Where each role may go. Pure, tested. */
export function canAccess(role: Role | null, path: string): boolean {
  if (path === '/sign-in') return true;
  if (role === null) return false;
  if (role === 'client') return path === '/portal' || path.startsWith('/portal/');
  return true;
}

export function homeFor(role: Role | null): string {
  if (role === 'owner') return '/';
  if (role === 'client') return '/portal';
  return '/sign-in';
}
