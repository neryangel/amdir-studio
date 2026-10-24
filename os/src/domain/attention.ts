import { daysBetween, israelDate } from './dates';
import { balanceDue } from './quote';
import type { Asset, AssetVersion, IsoDateTime, Lead, Milestone, Project, Quote, ReviewComment, Task } from './types';

export interface AttentionInput {
  readonly leads: readonly Lead[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly milestones: readonly Milestone[];
  readonly quotes: readonly Quote[];
  readonly assets: readonly Asset[];
  readonly versions: readonly AssetVersion[];
  readonly comments: readonly ReviewComment[];
}

export interface ReviewItem {
  readonly version: AssetVersion;
  readonly asset: Asset;
  readonly project: Project;
  /** Unresolved client comments the owner has to act on. */
  readonly openComments: number;
  readonly reason: 'changes-requested' | 'open-comments';
}

export interface OverdueTask {
  readonly task: Task;
  readonly project: Project | null;
  readonly daysLate: number;
}

export interface UnpaidQuote {
  readonly quote: Quote;
  readonly project: Project | null;
  readonly due: number;
}

export interface Attention {
  readonly today: string;
  /** New leads, oldest first: the longest-waiting person gets answered first. */
  readonly newLeads: readonly Lead[];
  readonly reviews: readonly ReviewItem[];
  /** Versions shared with the client and still waiting on them (informational). */
  readonly awaitingClient: number;
  readonly overdueTasks: readonly OverdueTask[];
  readonly dueToday: readonly Task[];
  readonly unpaidQuotes: readonly UnpaidQuote[];
  readonly unpaidTotal: number;
  readonly upcomingMilestones: readonly Milestone[];
  readonly totalItems: number;
}

/**
 * Pure: what needs the owner's attention today. Work on archived projects is ignored, but money
 * owed on them is not: an archived project with an unpaid balance still shows up.
 */
export function computeAttention(input: AttentionInput, now: IsoDateTime): Attention {
  const today = israelDate(now);
  const allProjects = new Map(input.projects.map((p) => [p.id, p]));
  const liveProjects = new Map(input.projects.filter((p) => p.stage !== 'archived').map((p) => [p.id, p]));

  const newLeads = input.leads
    .filter((l) => l.status === 'new')
    .slice()
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

  const assetById = new Map(input.assets.map((a) => [a.id, a]));
  const reviews: ReviewItem[] = [];
  let awaitingClient = 0;
  for (const version of input.versions) {
    const asset = assetById.get(version.assetId);
    const project = asset ? liveProjects.get(asset.projectId) : undefined;
    if (!asset || !project) continue;
    if (version.status === 'awaiting-client') awaitingClient += 1;
    const openComments = input.comments.filter((c) => c.versionId === version.id && !c.resolved && c.author === 'client').length;
    if (version.status === 'changes-requested') reviews.push({ version, asset, project, openComments, reason: 'changes-requested' });
    else if (openComments > 0 && version.status !== 'approved') reviews.push({ version, asset, project, openComments, reason: 'open-comments' });
  }
  reviews.sort((a, b) => b.openComments - a.openComments || a.version.updatedAt.localeCompare(b.version.updatedAt));

  const openTasks = input.tasks.filter((t) => !t.done && t.dueDate && liveProjects.has(t.projectId));
  const overdueTasks: OverdueTask[] = openTasks
    .filter((t) => (t.dueDate as string) < today)
    .map((task) => ({ task, project: liveProjects.get(task.projectId) ?? null, daysLate: daysBetween(task.dueDate as string, today) }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const dueToday = openTasks.filter((t) => t.dueDate === today);

  const unpaidQuotes: UnpaidQuote[] = input.quotes
    .map((quote) => ({ quote, project: allProjects.get(quote.projectId) ?? null, due: balanceDue(quote) }))
    .filter((q) => q.due > 0)
    .sort((a, b) => b.due - a.due);
  const unpaidTotal = unpaidQuotes.reduce((acc, q) => acc + q.due, 0);

  const upcomingMilestones = input.milestones
    .filter((m) => !m.done && liveProjects.has(m.projectId) && daysBetween(today, m.date) >= 0 && daysBetween(today, m.date) <= 7)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    today,
    newLeads,
    reviews,
    awaitingClient,
    overdueTasks,
    dueToday,
    unpaidQuotes,
    unpaidTotal,
    upcomingMilestones,
    totalItems: newLeads.length + reviews.length + overdueTasks.length + unpaidQuotes.length,
  };
}
