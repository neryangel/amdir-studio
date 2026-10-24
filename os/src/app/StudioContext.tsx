import { createContext, use, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Repositories } from '../data/repositories';
import type { Outbox, OutboxEntry } from '../providers/outbox';
import type { Providers } from '../providers/types';

export interface Studio {
  readonly repos: Repositories;
  readonly providers: Providers;
  readonly outbox: Outbox;
  readonly now: () => string;
}

const StudioCtx = createContext<Studio | null>(null);

export function StudioProvider({ studio, children }: { studio: Studio; children: ReactNode }) {
  return <StudioCtx value={studio}>{children}</StudioCtx>;
}

export function useStudio(): Studio {
  const s = use(StudioCtx);
  if (!s) throw new Error('useStudio must be used inside <StudioProvider>');
  return s;
}

export type Resource<T> =
  | { readonly status: 'loading'; readonly data: undefined; readonly error: undefined; readonly reload: () => void }
  | { readonly status: 'error'; readonly data: undefined; readonly error: Error; readonly reload: () => void }
  | { readonly status: 'ready'; readonly data: T; readonly error: undefined; readonly reload: () => void };

/**
 * Loads data through the repositories and re-loads after every write. The first load shows the
 * loading state; later refreshes keep the previous data on screen (no flicker).
 */
export function useResource<T>(load: (repos: Repositories) => Promise<T>, deps: readonly unknown[]): Resource<T> {
  const { repos } = useStudio();
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ready'; data?: T; error?: Error }>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const runLoad = useEffectEvent(() => load(repos));

  useEffect(() => repos.subscribe(() => setVersion((v) => v + 1)), [repos]);

  const depsKey = JSON.stringify(deps);
  useEffect(() => {
    let cancelled = false;
    runLoad().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repos, version, depsKey]);

  // Reset to loading when the identity of what we load changes (e.g. another project id).
  const [prevKey, setPrevKey] = useState(depsKey);
  if (prevKey !== depsKey) {
    setPrevKey(depsKey);
    setState({ status: 'loading' });
  }

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setVersion((v) => v + 1);
  }, []);

  return useMemo(() => {
    if (state.status === 'ready') return { status: 'ready', data: state.data as T, error: undefined, reload };
    if (state.status === 'error') return { status: 'error', data: undefined, error: state.error ?? new Error('Unknown error'), reload };
    return { status: 'loading', data: undefined, error: undefined, reload };
  }, [state, reload]);
}

export function useOutbox(): OutboxEntry[] {
  const { outbox } = useStudio();
  const subscribe = useCallback((cb: () => void) => outbox.subscribe(cb), [outbox]);
  const cache = useRef<{ list: OutboxEntry[]; key: string }>({ list: [], key: '' });
  const getSnapshot = useCallback(() => {
    const list = outbox.list();
    const key = list.map((e) => e.id).join('|');
    if (key !== cache.current.key) cache.current = { list, key };
    return cache.current.list;
  }, [outbox]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
