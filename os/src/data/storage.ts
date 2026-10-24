/** Minimal key/value contract; localStorage satisfies it. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

export interface SafeStorage extends KeyValueStorage {
  /** False when the backing storage threw (private mode, quota, blocked) and memory is used instead. */
  readonly persistent: () => boolean;
}

/**
 * Wraps a storage that may be missing or throw on every access (Safari private mode, blocked
 * cookies, quota). Never throws; falls back to an in-memory map so the app keeps working.
 */
export function createSafeStorage(get: () => KeyValueStorage | undefined | null): SafeStorage {
  const fallback = createMemoryStorage();
  let backing: KeyValueStorage | null = null;
  let ok = true;
  try {
    backing = get() ?? null;
    if (backing) {
      const probe = '__studio_os_probe__';
      backing.setItem(probe, '1');
      backing.removeItem(probe);
    }
  } catch {
    backing = null;
  }
  if (!backing) ok = false;

  const run = <T>(fn: (s: KeyValueStorage) => T, fallbackFn: (s: KeyValueStorage) => T): T => {
    if (backing && ok) {
      try {
        return fn(backing);
      } catch {
        ok = false;
      }
    }
    return fallbackFn(fallback);
  };

  return {
    getItem: (k) => run((s) => s.getItem(k), (s) => s.getItem(k)),
    setItem: (k, v) => {
      fallback.setItem(k, v);
      run((s) => s.setItem(k, v), () => undefined);
    },
    removeItem: (k) => {
      fallback.removeItem(k);
      run((s) => s.removeItem(k), () => undefined);
    },
    persistent: () => ok && backing !== null,
  };
}

export function browserStorage(): SafeStorage {
  return createSafeStorage(() => (typeof window === 'undefined' ? null : window.localStorage));
}
