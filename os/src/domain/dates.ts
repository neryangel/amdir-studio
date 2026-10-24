import type { IsoDate, IsoDateTime } from './types';

const DAY_MS = 86_400_000;

/** Calendar date (yyyy-mm-dd) of an instant, in Israel time. */
export function israelDate(at: Date | IsoDateTime): IsoDate {
  const d = typeof at === 'string' ? new Date(at) : at;
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Adds whole days to a calendar date. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const t = Date.parse(`${date}T12:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}

const DATE_FMT = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const DATE_SHORT = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DATETIME_FMT = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jerusalem',
});

export function formatDate(date: IsoDate, opts: { short?: boolean } = {}): string {
  const d = new Date(`${date}T12:00:00Z`);
  return (opts.short ? DATE_SHORT : DATE_FMT).format(d);
}

export function formatDateTime(at: IsoDateTime): string {
  return DATETIME_FMT.format(new Date(at));
}

/** "היום", "אתמול", "לפני 3 ימים", "מחר", "בעוד 4 ימים". */
export function relativeDay(date: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'היום';
  if (diff === -1) return 'אתמול';
  if (diff === 1) return 'מחר';
  if (diff < 0) return `לפני ${-diff} ימים`;
  return `בעוד ${diff} ימים`;
}
