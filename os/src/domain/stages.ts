import type { IsoDateTime, Project } from './types';

/** Project lifecycle, in order. `archived` sits outside the working flow. */
export const PROJECT_STAGES = [
  'inquiry',
  'proposal',
  'pre-production',
  'production',
  'post',
  'review',
  'delivered',
  'archived',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

/** The working flow (everything but archived). */
export const FLOW_STAGES = PROJECT_STAGES.filter((s): s is Exclude<ProjectStage, 'archived'> => s !== 'archived');

export const STAGE_LABEL: Record<ProjectStage, string> = {
  inquiry: 'פנייה',
  proposal: 'הצעה',
  'pre-production': 'טרום הפקה',
  production: 'הפקה',
  post: 'פוסט',
  review: 'בבדיקת לקוח',
  delivered: 'נמסר',
  archived: 'ארכיון',
};

export function isProjectStage(value: unknown): value is ProjectStage {
  return typeof value === 'string' && (PROJECT_STAGES as readonly string[]).includes(value);
}

export function stageIndex(stage: ProjectStage): number {
  return PROJECT_STAGES.indexOf(stage);
}

/** Next stage in the working flow, or null at the end (delivered) and for archived. */
export function nextStage(stage: ProjectStage): ProjectStage | null {
  if (stage === 'archived' || stage === 'delivered') return null;
  return PROJECT_STAGES[stageIndex(stage) + 1] ?? null;
}

/** Previous stage in the working flow, or null at the start (inquiry) and for archived. */
export function previousStage(stage: ProjectStage): ProjectStage | null {
  if (stage === 'archived' || stage === 'inquiry') return null;
  return PROJECT_STAGES[stageIndex(stage) - 1] ?? null;
}

/**
 * Transition rules:
 *  - one step forward or back in the working flow;
 *  - any working stage can be archived;
 *  - an archived project can only be restored, to the stage it was archived from
 *    (or `delivered` when that is unknown).
 * Skipping stages is not allowed: every move is one deliberate, keyboard-operable step.
 */
export function allowedMoves(project: Pick<Project, 'stage' | 'stageBeforeArchive'>): ProjectStage[] {
  if (project.stage === 'archived') return [project.stageBeforeArchive ?? 'delivered'];
  const moves: ProjectStage[] = [];
  const prev = previousStage(project.stage);
  const next = nextStage(project.stage);
  if (prev) moves.push(prev);
  if (next) moves.push(next);
  moves.push('archived');
  return moves;
}

export function canMove(project: Pick<Project, 'stage' | 'stageBeforeArchive'>, to: ProjectStage): boolean {
  return allowedMoves(project).includes(to);
}

export class StageTransitionError extends Error {
  constructor(
    readonly from: ProjectStage,
    readonly to: ProjectStage,
  ) {
    super(`Cannot move a project from "${from}" to "${to}"`);
    this.name = 'StageTransitionError';
  }
}

/** Pure: returns the moved project with a history entry. Throws StageTransitionError on an illegal move. */
export function moveProject<P extends Project>(project: P, to: ProjectStage, at: IsoDateTime): P {
  if (!canMove(project, to)) throw new StageTransitionError(project.stage, to);
  return {
    ...project,
    stage: to,
    stageBeforeArchive: to === 'archived' ? project.stage : null,
    stageHistory: [...project.stageHistory, { from: project.stage, to, at }],
    updatedAt: at,
  };
}

/** 0..1 progress through the working flow (archived counts as complete). */
export function stageProgress(stage: ProjectStage): number {
  if (stage === 'archived') return 1;
  return stageIndex(stage) / (FLOW_STAGES.length - 1);
}
