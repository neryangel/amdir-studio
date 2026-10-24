import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: 'ok' | 'error';
}

interface AnnouncerApi {
  /** Shows a short toast and announces it to screen readers. */
  readonly announce: (message: string, tone?: Toast['tone']) => void;
}

const Ctx = createContext<AnnouncerApi | null>(null);

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const seq = useRef(0);
  const announce = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    seq.current += 1;
    setToast({ id: seq.current, message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const api = useMemo(() => ({ announce }), [announce]);
  return (
    <Ctx value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toast ? (
          <p key={toast.id} className={`toast toast--${toast.tone}`}>
            {toast.message}
          </p>
        ) : null}
      </div>
    </Ctx>
  );
}

export function useAnnouncer(): AnnouncerApi {
  const a = use(Ctx);
  if (!a) throw new Error('useAnnouncer must be used inside <AnnouncerProvider>');
  return a;
}

/** Hebrew, human error text for anything a repository or provider throws. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'NotFoundError') return 'הפריט לא נמצא. ייתכן שנתוני הדמו אופסו.';
    if (/[֐-׿]/.test(error.message)) return error.message;
    if (error.name === 'ValidationError') return 'חלק מהשדות לא תקינים. בדקו ונסו שוב.';
    if (error.name === 'ProviderError') return 'הספק המדומה דחה את הבקשה. הפרטים נרשמו בתיבת היוצאים.';
  }
  return 'משהו השתבש. נסו שוב.';
}
