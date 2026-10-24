import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimelineTotal, stageWeights, timelineSpan, type TimelineStage } from '../src/lib/timeline';

const LRI = '⁦';
const PDI = '⁩';
const plain = (s: string | undefined) => s?.replace(/[⁦⁩]/g, '');

describe('formatDuration', () => {
  it('formats ranges with an en dash, isolated as LTR so they do not flip inside Hebrew', () => {
    expect(formatDuration(3, 5, 'days')).toBe(`${LRI}3–5${PDI} ימי עבודה`);
    expect(plain(formatDuration(1, 2, 'weeks'))).toBe('1–2 שבועות');
  });

  it('uses singular forms for exactly one', () => {
    expect(formatDuration(1, 1, 'days')).toBe('יום עבודה');
    expect(formatDuration(1, 1, 'weeks')).toBe('שבוע');
    expect(formatDuration(4, 4, 'days')).toBe('4 ימי עבודה');
  });

  it('tolerates min/max given in the wrong order', () => {
    expect(plain(formatDuration(5, 2, 'days'))).toBe('2–5 ימי עבודה');
  });
});

describe('timeline totals', () => {
  const clips: TimelineStage[] = [
    { stage: 'פרה', min: 1, max: 3, unit: 'weeks' },
    { stage: 'צילום', min: 1, max: 2, unit: 'days' },
    { stage: 'עריכה', min: 1, max: 2, unit: 'weeks' },
    { stage: 'תיקונים', min: 3, max: 7, unit: 'days' },
    { stage: 'מסירה', min: 1, max: 2, unit: 'days' },
  ];

  it('sums stages in working days (5 per week)', () => {
    expect(timelineSpan(clips)).toEqual({ min: 15, max: 36 });
  });

  it('rounds long spans to whole weeks, min down and max up', () => {
    expect(plain(formatTimelineTotal(clips))).toBe('3–8 שבועות');
  });

  it('keeps short spans in working days', () => {
    expect(plain(formatTimelineTotal([{ stage: 'א', min: 2, max: 4, unit: 'days' }, { stage: 'ב', min: 1, max: 1, unit: 'days' }]))).toBe(
      '3–5 ימי עבודה',
    );
  });

  it('is undefined without stages', () => {
    expect(formatTimelineTotal([])).toBeUndefined();
  });

  it('weights each stage by its average length, summing to ~100', () => {
    const w = stageWeights([
      { stage: 'א', min: 1, max: 1, unit: 'weeks' },
      { stage: 'ב', min: 5, max: 5, unit: 'days' },
    ]);
    expect(w).toEqual([50, 50]);
    expect(stageWeights(clips).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });
});
