import { useState } from 'react';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { errorMessage, useAnnouncer } from '../../app/announcer';
import { useResource, useStudio } from '../../app/StudioContext';
import { PROJECT_KIND_LABEL } from '../../domain/labels';
import { FLOW_STAGES, STAGE_LABEL, allowedMoves, nextStage, previousStage, stageIndex, type ProjectStage } from '../../domain/stages';
import type { Client, Project } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { Button, ButtonLink, DemoTag, ErrorState, LoadingState } from '../../ui/primitives';

export interface ProjectContext {
  readonly project: Project;
  readonly client: Client | null;
}

export function useProject(): ProjectContext {
  return useOutletContext<ProjectContext>();
}

function StageStepper({ stage }: { stage: ProjectStage }) {
  const current = stage === 'archived' ? -1 : stageIndex(stage);
  return (
    <ol className="stepper" aria-label="שלבי הפרויקט">
      {FLOW_STAGES.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className={`stepper__step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="stepper__dot" aria-hidden="true">
              {state === 'done' ? <Icon name="check" size={12} /> : null}
            </span>
            <span className="stepper__label">
              {STAGE_LABEL[s]}
              {state === 'done' ? <span className="visually-hidden"> (הושלם)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StageControls({ project }: { project: Project }) {
  const { repos } = useStudio();
  const { announce } = useAnnouncer();
  const [busy, setBusy] = useState(false);
  const moves = allowedMoves(project);
  const move = async (to: ProjectStage) => {
    setBusy(true);
    try {
      await repos.projects.move(project.id, to);
      announce(to === 'archived' ? `״${project.title}״ הועבר לארכיון.` : `השלב עודכן ל${STAGE_LABEL[to]}.`);
    } catch (e) {
      announce(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const prev = previousStage(project.stage);
  const next = nextStage(project.stage);
  return (
    <div className="stage-controls" role="group" aria-label="העברת שלב">
      {project.stage === 'archived' ? (
        <Button icon="refresh" onClick={() => void move(moves[0] ?? 'delivered')} disabled={busy}>
          שחזור ל{STAGE_LABEL[moves[0] ?? 'delivered']}
        </Button>
      ) : (
        <>
          {prev ? (
            <Button size="sm" icon="chevronStart" aria-label={`החזרה לשלב ${STAGE_LABEL[prev]}`} onClick={() => void move(prev)} disabled={busy}>
              {STAGE_LABEL[prev]}
            </Button>
          ) : null}
          {next ? (
            <Button size="sm" variant="primary" aria-label={`העברה לשלב ${STAGE_LABEL[next]}`} onClick={() => void move(next)} disabled={busy}>
              {STAGE_LABEL[next]}
              <Icon name="chevronEnd" size={16} />
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon="archive" onClick={() => void move('archived')} disabled={busy}>
            לארכיון
          </Button>
        </>
      )}
    </div>
  );
}

const TABS = [
  { to: '', label: 'סקירה', end: true },
  { to: 'tasks', label: 'משימות' },
  { to: 'milestones', label: 'אבני דרך' },
  { to: 'files', label: 'קבצים וגרסאות' },
  { to: 'quote', label: 'הצעת מחיר' },
] as const;

export function ProjectLayout() {
  const { projectId = '' } = useParams();
  const res = useResource(
    async (r) => {
      const project = await r.projects.get(projectId);
      const client = project ? await r.clients.get(project.clientId) : null;
      return { project, client };
    },
    [projectId],
  );
  const back = (
    <ButtonLink to="/projects" variant="ghost" size="sm" icon="chevronStart">
      חזרה ללוח
    </ButtonLink>
  );
  if (res.status === 'loading') return (<>{back}<LoadingState label="טוען פרויקט…" rows={6} /></>);
  if (res.status === 'error') return (<>{back}<ErrorState error={res.error} onRetry={res.reload} /></>);
  const { project, client } = res.data;
  if (!project) return (<>{back}<ErrorState title="הפרויקט לא נמצא" /></>);

  const ctx: ProjectContext = { project, client };
  return (
    <>
      {back}
      <header className="project-head">
        <div className="project-head__text">
          <p className="eyebrow">
            {PROJECT_KIND_LABEL[project.kind]} · {client ? <Link className="link" to={`/clients/${client.id}`}>{client.name}</Link> : 'ללא לקוח'}
            {project.demo ? <DemoTag /> : null}
          </p>
          <h1>{project.title}</h1>
          <p className="project-head__stage">
            שלב נוכחי: <strong>{STAGE_LABEL[project.stage]}</strong>
          </p>
        </div>
        <StageControls project={project} />
      </header>
      <StageStepper stage={project.stage} />
      <nav className="tabs" aria-label="חלקי הפרויקט">
        <ul>
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to === '' ? `/projects/${project.id}` : `/projects/${project.id}/${t.to}`} end={'end' in t} className="tabs__link">
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="tab-panel">
        <Outlet context={ctx} />
      </div>
    </>
  );
}
