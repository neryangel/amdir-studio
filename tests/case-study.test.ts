import { describe, expect, it } from 'vitest';
import {
  OWNER_FALLBACK_ROLE,
  compareValueText,
  creditRows,
  deliveryAspects,
  paragraphs,
  sectionNumber,
} from '../src/lib/case-study';

describe('creditRows', () => {
  it('lists the owner roles first, each with the owner name', () => {
    const rows = creditRows(['רעיון והפקה', ' עריכה '], 'נריה', [{ role: 'מוזיקה' }]);
    expect(rows).toEqual([
      { role: 'רעיון והפקה', name: 'נריה', owner: true },
      { role: 'עריכה', name: 'נריה', owner: true },
      { role: 'מוזיקה', name: undefined, owner: false },
    ]);
  });

  it('always credits the owner, even with no roles', () => {
    expect(creditRows([], 'נריה')).toEqual([{ role: OWNER_FALLBACK_ROLE, name: 'נריה', owner: true }]);
    expect(creditRows(['', '  '], 'נריה')[0]).toMatchObject({ owner: true, name: 'נריה' });
  });

  it('keeps optional crew names, drops blank roles and exact duplicates', () => {
    const rows = creditRows(['צילום'], 'נריה', [
      { role: 'צילום', name: 'נריה' },
      { role: ' ', name: 'x' },
      { role: 'צילום נוסף', name: '  ' },
      { role: 'סאונד', name: 'דנה' },
    ]);
    expect(rows.map((r) => [r.role, r.name ?? null])).toEqual([
      ['צילום', 'נריה'],
      ['צילום נוסף', null],
      ['סאונד', 'דנה'],
    ]);
  });
});

describe('deliveryAspects', () => {
  it('returns distinct aspects in canonical order', () => {
    expect(deliveryAspects([{ aspect: '1:1' }, { aspect: '16:9' }, { aspect: '1:1' }, { aspect: '9:16' }])).toEqual([
      '16:9',
      '9:16',
      '1:1',
    ]);
  });
  it('falls back to the main aspect only when there are no formats', () => {
    expect(deliveryAspects([], '9:16')).toEqual(['9:16']);
    expect(deliveryAspects([{ aspect: '4:5' }], '16:9')).toEqual(['4:5']);
    expect(deliveryAspects([])).toEqual([]);
  });
});

describe('compareValueText', () => {
  it('describes both sides and clamps', () => {
    expect(compareValueText(50, 'גלם', 'אחרי צבע')).toBe('גלם 50%, אחרי צבע 50%');
    expect(compareValueText(-5, 'לפני', 'אחרי')).toBe('לפני 0%, אחרי 100%');
    expect(compareValueText(72.6, 'לפני', 'אחרי')).toBe('לפני 73%, אחרי 27%');
  });
});

describe('paragraphs / sectionNumber', () => {
  it('splits on blank lines and joins soft wraps', () => {
    expect(paragraphs('שורה א\nהמשך\n\n  פסקה ב  ')).toEqual(['שורה א המשך', 'פסקה ב']);
    expect(paragraphs(undefined)).toEqual([]);
  });
  it('pads section numbers', () => {
    expect(sectionNumber(0)).toBe('01');
    expect(sectionNumber(11)).toBe('12');
  });
});
