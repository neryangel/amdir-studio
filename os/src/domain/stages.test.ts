import { describe, expect, it } from 'vitest';
import {
  FLOW_STAGES,
  PROJECT_STAGES,
  STAGE_LABEL,
  StageTransitionError,
  allowedMoves,
  canMove,
  isProjectStage,
  moveProject,
  nextStage,
  previousStage,
  stageProgress,
} from './stages';
import type { Project } from './types';

function project(partial: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    demo: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    clientId: 'c1',
    title: 'פרויקט',
    kind: 'clip',
    stage: 'inquiry',
    stageBeforeArchive: null,
    stageHistory: [{ from: null, to: 'inquiry', at: '2026-10-01T00:00:00.000Z' }],
    summary: '',
    dueDate: null,
    ...partial,
  };
}

describe('stage order', () => {
  it('is the agreed lifecycle', () => {
    expect(PROJECT_STAGES).toEqual(['inquiry', 'proposal', 'pre-production', 'production', 'post', 'review', 'delivered', 'archived']);
    expect(FLOW_STAGES).not.toContain('archived');
    expect(FLOW_STAGES).toHaveLength(7);
  });
  it('every stage has a Hebrew label', () => {
    for (const s of PROJECT_STAGES) expect(STAGE_LABEL[s]).toMatch(/[֐-׿]/);
  });
  it('isProjectStage guards strings', () => {
    expect(isProjectStage('post')).toBe(true);
    expect(isProjectStage('done')).toBe(false);
    expect(isProjectStage(3)).toBe(false);
  });
  it('next/previous walk the flow and stop at its ends', () => {
    expect(nextStage('inquiry')).toBe('proposal');
    expect(nextStage('review')).toBe('delivered');
    expect(nextStage('delivered')).toBeNull();
    expect(nextStage('archived')).toBeNull();
    expect(previousStage('proposal')).toBe('inquiry');
    expect(previousStage('inquiry')).toBeNull();
    expect(previousStage('archived')).toBeNull();
  });
});

describe('allowedMoves', () => {
  it('inquiry: forward or archive', () => {
    expect(allowedMoves({ stage: 'inquiry', stageBeforeArchive: null })).toEqual(['proposal', 'archived']);
  });
  it('middle: back, forward, archive', () => {
    expect(allowedMoves({ stage: 'production', stageBeforeArchive: null })).toEqual(['pre-production', 'post', 'archived']);
  });
  it('delivered: back or archive', () => {
    expect(allowedMoves({ stage: 'delivered', stageBeforeArchive: null })).toEqual(['review', 'archived']);
  });
  it('archived: only restore to where it was', () => {
    expect(allowedMoves({ stage: 'archived', stageBeforeArchive: 'post' })).toEqual(['post']);
    expect(allowedMoves({ stage: 'archived', stageBeforeArchive: null })).toEqual(['delivered']);
  });
  it('never allows skipping or staying put', () => {
    for (const stage of FLOW_STAGES) {
      const p = { stage, stageBeforeArchive: null };
      expect(canMove(p, stage)).toBe(false);
      for (const to of FLOW_STAGES) {
        const distance = Math.abs(FLOW_STAGES.indexOf(to) - FLOW_STAGES.indexOf(stage));
        expect(canMove(p, to)).toBe(distance === 1);
      }
    }
  });
});

describe('moveProject', () => {
  it('moves one step and records history', () => {
    const moved = moveProject(project(), 'proposal', '2026-10-02T10:00:00.000Z');
    expect(moved.stage).toBe('proposal');
    expect(moved.updatedAt).toBe('2026-10-02T10:00:00.000Z');
    expect(moved.stageHistory.at(-1)).toEqual({ from: 'inquiry', to: 'proposal', at: '2026-10-02T10:00:00.000Z' });
    expect(moved.stageHistory).toHaveLength(2);
  });
  it('is pure', () => {
    const original = project();
    moveProject(original, 'proposal', '2026-10-02T10:00:00.000Z');
    expect(original.stage).toBe('inquiry');
    expect(original.stageHistory).toHaveLength(1);
  });
  it('archive remembers the stage and restore returns to it', () => {
    const archived = moveProject(project({ stage: 'post' }), 'archived', '2026-10-03T00:00:00.000Z');
    expect(archived.stageBeforeArchive).toBe('post');
    const restored = moveProject(archived, 'post', '2026-10-04T00:00:00.000Z');
    expect(restored.stage).toBe('post');
    expect(restored.stageBeforeArchive).toBeNull();
  });
  it('throws a typed error on illegal moves', () => {
    expect(() => moveProject(project(), 'production', '2026-10-02T00:00:00.000Z')).toThrow(StageTransitionError);
    try {
      moveProject(project(), 'delivered', '2026-10-02T00:00:00.000Z');
    } catch (e) {
      expect(e).toBeInstanceOf(StageTransitionError);
      expect((e as StageTransitionError).from).toBe('inquiry');
      expect((e as StageTransitionError).to).toBe('delivered');
    }
  });
});

describe('stageProgress', () => {
  it('runs 0 → 1 across the flow', () => {
    expect(stageProgress('inquiry')).toBe(0);
    expect(stageProgress('delivered')).toBe(1);
    expect(stageProgress('archived')).toBe(1);
    expect(stageProgress('production')).toBeCloseTo(0.5);
  });
});
