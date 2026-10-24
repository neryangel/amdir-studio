import { describe, expect, it } from 'vitest';
import { buildDemoSeed } from '../data/seed';
import { computeAttention } from './attention';

const NOW = '2026-10-24T07:00:00.000Z'; // 10:00 in Israel

describe('computeAttention on the demo seed', () => {
  const seed = buildDemoSeed(NOW);
  const a = computeAttention(seed, NOW);

  it('uses the Israel calendar day', () => {
    expect(a.today).toBe('2026-10-24');
  });
  it('lists new leads oldest first, excluding replied/spam', () => {
    expect(a.newLeads.map((l) => l.id)).toEqual(['demo-lead-1', 'demo-lead-2', 'demo-lead-3']);
  });
  it('finds reviews needing the owner (changes requested or open client comments)', () => {
    const ids = a.reviews.map((r) => r.version.id);
    expect(ids).toContain('demo-ver-2');
    expect(ids).toContain('demo-ver-3');
    expect(ids).not.toContain('demo-ver-4'); // approved
    const v2 = a.reviews.find((r) => r.version.id === 'demo-ver-2');
    expect(v2?.openComments).toBe(2); // owner's own comment does not count
    expect(a.awaitingClient).toBe(1);
  });
  it('lists overdue open tasks, most late first, and skips archived projects and done tasks', () => {
    expect(a.overdueTasks.map((o) => o.task.id)).toEqual(['demo-tsk-7', 'demo-tsk-1', 'demo-tsk-4']);
    expect(a.overdueTasks[0]?.daysLate).toBe(3);
    expect(a.dueToday.map((t) => t.id).sort()).toEqual(['demo-tsk-2', 'demo-tsk-9']);
  });
  it('sums balances of accepted, not fully paid quotes', () => {
    expect(a.unpaidQuotes.map((q) => q.quote.id)).toEqual(['demo-q-2', 'demo-q-1']);
    expect(a.unpaidQuotes[0]?.due).toBe(1_604_800);
    expect(a.unpaidQuotes[1]?.due).toBe(1_368_800 - 708_000);
    expect(a.unpaidTotal).toBe(1_604_800 + 660_800);
  });
  it('shows milestones in the next 7 days', () => {
    expect(a.upcomingMilestones.map((m) => m.id)).toEqual(['demo-mil-4', 'demo-mil-6']);
  });
  it('counts the attention items', () => {
    expect(a.totalItems).toBe(3 + a.reviews.length + 3 + 2);
  });
});

describe('computeAttention edge cases', () => {
  it('is empty for empty data', () => {
    const a = computeAttention({ leads: [], projects: [], tasks: [], milestones: [], quotes: [], assets: [], versions: [], comments: [] }, NOW);
    expect(a.totalItems).toBe(0);
    expect(a.unpaidTotal).toBe(0);
  });
  it('ignores reviews on archived projects but keeps money still owed on them', () => {
    const seed = buildDemoSeed(NOW);
    const projects = seed.projects.map((p) => (p.id === 'demo-prj-1' || p.id === 'demo-prj-2' ? { ...p, stage: 'archived' as const } : p));
    const a = computeAttention({ ...seed, projects }, NOW);
    expect(a.reviews.map((r) => r.version.id)).not.toContain('demo-ver-2');
    expect(a.unpaidQuotes.map((q) => q.quote.id)).toEqual(['demo-q-2', 'demo-q-1']);
    expect(a.overdueTasks.map((o) => o.task.id)).toEqual(['demo-tsk-7']);
  });
});
