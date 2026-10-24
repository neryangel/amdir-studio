// Pure helpers for the work (case study) page. No astro:* imports, so they are unit-tested in tests/.
import { ASPECTS, type Aspect } from './enums';

export interface CreditRow {
  role: string;
  /** Undefined = name not given (rendered as "לא צוין"). */
  name?: string | undefined;
  owner: boolean;
}

/** Fallback role when a work lists no roles at all: the owner is always credited. */
export const OWNER_FALLBACK_ROLE = 'יצירה';

/**
 * Credits as role → name rows. The owner's roles come first and always carry the owner's name;
 * other people follow in the order given. Blank roles are dropped; duplicates of an owner role are kept
 * only when they carry a different name.
 */
export function creditRows(
  ownerRoles: readonly string[],
  ownerName: string,
  crew: readonly { role: string; name?: string | undefined }[] = [],
): CreditRow[] {
  const roles = ownerRoles.map((r) => r.trim()).filter(Boolean);
  const rows: CreditRow[] = (roles.length ? roles : [OWNER_FALLBACK_ROLE]).map((role) => ({ role, name: ownerName, owner: true }));
  for (const c of crew) {
    const role = c.role.trim();
    if (!role) continue;
    const name = c.name?.trim() || undefined;
    if (rows.some((r) => r.role === role && r.name === name)) continue;
    rows.push({ role, name, owner: false });
  }
  return rows;
}

/** Distinct delivery aspects, in canonical order (16:9, 9:16, 1:1, 4:5). Falls back to the main aspect. */
export function deliveryAspects(formats: readonly { aspect: Aspect }[], main?: Aspect): Aspect[] {
  const set = new Set<Aspect>(formats.map((f) => f.aspect));
  if (!set.size && main) set.add(main);
  return ASPECTS.filter((a) => set.has(a));
}

/** Screen-reader value for the before/after slider. `pos` = percent of the BEFORE image shown. */
export function compareValueText(pos: number, before: string, after: string): string {
  const p = Math.round(Math.min(100, Math.max(0, pos)));
  return `${before} ${p}%, ${after} ${100 - p}%`;
}

/** Split a multiline field into paragraphs (blank line = new paragraph). */
export function paragraphs(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** Two-digit section number for the editorial index ("01"). */
export const sectionNumber = (i: number): string => String(i + 1).padStart(2, '0');
