/** Review timecodes are integer milliseconds. Display: m:ss.mmm, or h:mm:ss.mmm from one hour up. */
export function formatTimecode(ms: number): string {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError('timecode must be a non-negative integer of ms');
  const millis = ms % 1000;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}.${mmm}`;
  return `${minutes}:${ss}.${mmm}`;
}

/** Parses "m:ss", "m:ss.mmm", "h:mm:ss(.mmm)". Returns null when invalid. */
export function parseTimecode(input: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(input.trim());
  if (!m) return null;
  const [, h, mi, s, frac] = m;
  const hours = h ? Number(h) : 0;
  const minutes = Number(mi);
  const seconds = Number(s);
  if (seconds > 59 || (h !== undefined && minutes > 59)) return null;
  const millis = frac ? Number(frac.padEnd(3, '0')) : 0;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}
