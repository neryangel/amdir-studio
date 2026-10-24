// Typical-timeline helpers for service pages. Pure functions, unit-tested in tests/timeline.test.ts.
// Durations are ranges the owner typed in; nothing here invents a number. The total is a plain sum,
// shown as an approximation ("בערך"), and the exact schedule is always set in the written proposal.
import { DURATION_UNIT_LABEL, type DurationUnit } from './enums';

export interface TimelineStage {
  stage: string;
  min: number;
  max: number;
  unit: DurationUnit;
}

/** Working days per week, used only to add stages of different units together. */
export const WORKDAYS_PER_WEEK = 5;

const SINGULAR: Record<DurationUnit, string> = { days: 'יום עבודה', weeks: 'שבוע' };

/** Left-to-right isolate (LRI ... PDI). */
const LRI = '⁦';
const PDI = '⁩';

/**
 * "3–5 ימי עבודה", "1–2 שבועות", "שבוע", "יום עבודה". Range uses an en dash.
 * An en dash is a bidi neutral, so inside Hebrew text "3–5" would display as "5–3".
 * The range is wrapped in an LTR isolate so it always reads "3–5".
 */
export function formatDuration(min: number, max: number, unit: DurationUnit): string {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) return lo === 1 ? SINGULAR[unit] : `${lo} ${DURATION_UNIT_LABEL[unit]}`;
  return `${LRI}${lo}–${hi}${PDI} ${DURATION_UNIT_LABEL[unit]}`;
}

export function toWorkdays(n: number, unit: DurationUnit): number {
  return unit === 'weeks' ? n * WORKDAYS_PER_WEEK : n;
}

/** Sum of all stages in working days. */
export function timelineSpan(stages: readonly TimelineStage[]): { min: number; max: number } {
  return stages.reduce(
    (acc, s) => ({ min: acc.min + toWorkdays(s.min, s.unit), max: acc.max + toWorkdays(s.max, s.unit) }),
    { min: 0, max: 0 },
  );
}

/**
 * Human total for the whole timeline, or undefined when there are no stages.
 * Up to two weeks stays in working days; longer spans are rounded to whole weeks (min down, max up).
 */
export function formatTimelineTotal(stages: readonly TimelineStage[]): string | undefined {
  if (!stages.length) return undefined;
  const { min, max } = timelineSpan(stages);
  if (max <= 2 * WORKDAYS_PER_WEEK) return formatDuration(min, max, 'days');
  const wMin = Math.max(1, Math.floor(min / WORKDAYS_PER_WEEK));
  const wMax = Math.max(wMin, Math.ceil(max / WORKDAYS_PER_WEEK));
  return formatDuration(wMin, wMax, 'weeks');
}

/**
 * Relative weight of each stage (average length in working days), as percentages summing to 100.
 * Used only for the decorative bar; the text always states the real range.
 */
export function stageWeights(stages: readonly TimelineStage[]): number[] {
  const avgs = stages.map((s) => (toWorkdays(s.min, s.unit) + toWorkdays(s.max, s.unit)) / 2);
  const total = avgs.reduce((a, b) => a + b, 0);
  if (!total) return stages.map(() => 0);
  return avgs.map((a) => Math.round((a / total) * 1000) / 10);
}
