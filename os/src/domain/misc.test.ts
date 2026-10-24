import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isIsoDate, israelDate, relativeDay } from './dates';
import { formatBytes } from './labels';
import { formatTimecode, parseTimecode } from './timecode';

describe('timecode (ms)', () => {
  it.each([
    [0, '0:00.000'],
    [1_500, '0:01.500'],
    [83_042, '1:23.042'],
    [3_600_000, '1:00:00.000'],
    [3_723_004, '1:02:03.004'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatTimecode(ms)).toBe(text);
    expect(parseTimecode(text)).toBe(ms);
  });
  it('parses short forms', () => {
    expect(parseTimecode('1:23')).toBe(83_000);
    expect(parseTimecode('1:23.5')).toBe(83_500);
    expect(parseTimecode(' 0:05 ')).toBe(5_000);
  });
  it('rejects invalid input', () => {
    for (const bad of ['', '1', '1:60', '1:2', 'a:bc', '1:61:00', '-1:00']) expect(parseTimecode(bad)).toBeNull();
    expect(() => formatTimecode(-1)).toThrow(RangeError);
    expect(() => formatTimecode(1.5)).toThrow(RangeError);
  });
});

describe('dates', () => {
  it('israelDate uses Israel time (UTC+2/+3)', () => {
    expect(israelDate('2026-10-23T22:30:00.000Z')).toBe('2026-10-24');
    expect(israelDate('2026-10-23T20:00:00.000Z')).toBe('2026-10-23');
  });
  it('addDays and daysBetween are calendar-exact across DST', () => {
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
    expect(addDays('2026-03-26', 3)).toBe('2026-03-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-10-20', '2026-10-24')).toBe(4);
    expect(daysBetween('2026-10-24', '2026-10-20')).toBe(-4);
  });
  it('isIsoDate validates real calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('26-02-01')).toBe(false);
  });
  it('relativeDay speaks Hebrew', () => {
    expect(relativeDay('2026-10-24', '2026-10-24')).toBe('היום');
    expect(relativeDay('2026-10-23', '2026-10-24')).toBe('אתמול');
    expect(relativeDay('2026-10-25', '2026-10-24')).toBe('מחר');
    expect(relativeDay('2026-10-20', '2026-10-24')).toBe('לפני 4 ימים');
    expect(relativeDay('2026-10-30', '2026-10-24')).toBe('בעוד 6 ימים');
  });
});

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(734_003_200)).toBe('700 MB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
  });
});
