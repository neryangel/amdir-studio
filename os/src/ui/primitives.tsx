import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { formatAgorot } from '../domain/money';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  busy = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: IconName; busy?: boolean }) {
  return (
    <button
      type={type}
      className={cls('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', busy && 'is-busy', className)}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: LinkProps & { variant?: Variant; size?: 'sm' | 'md'; icon?: IconName }) {
  return (
    <Link className={cls('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)} {...rest}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </Link>
  );
}

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/** Amounts are always rendered from integer agorot, in tabular numerals. */
export function Money({ agorot, compact = false, className }: { agorot: number; compact?: boolean; className?: string }) {
  return <span className={cls('num', className)}>{formatAgorot(agorot, { compact })}</span>;
}

export function PageHeader({ title, eyebrow, description, actions }: { title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-header__desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function LoadingState({ label = 'טוען…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className="skeleton__row" style={{ inlineSize: `${String(92 - ((i * 17) % 35))}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ title = 'לא הצלחנו לטעון את הנתונים', error, onRetry }: { title?: string; error?: Error; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon">
        <Icon name="alert" size={22} />
      </span>
      <div>
        <p className="state__title">{title}</p>
        <p className="state__text">{error?.name === 'NotFoundError' ? 'הפריט לא נמצא.' : 'זו תקלה אצלנו, לא אצלכם. הנתונים שלכם לא נפגעו.'}</p>
        {onRetry ? (
          <Button size="sm" icon="refresh" onClick={onRetry}>
            ניסיון נוסף
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'sparkle', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state state--empty">
      <span className="state__icon">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="state__title">{title}</p>
        {children ? <p className="state__text">{children}</p> : null}
        {action}
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cls('field', error && 'field--error', className)}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria-describedby for a Field's control. */
export function describedBy(id: string, opts: { hint?: boolean; error?: string | null | false | undefined }): string | undefined {
  const ids = [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export function DemoTag() {
  return (
    <span className="demo-tag" title="רשומת דמו">
      דמו
    </span>
  );
}
