import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage, useAnnouncer } from '../../app/announcer';
import { useResource, useStudio } from '../../app/StudioContext';
import { formatDate, relativeDay, israelDate } from '../../domain/dates';
import { PROJECT_KIND_LABEL } from '../../domain/labels';
import { FLOW_STAGES, STAGE_LABEL, nextStage, previousStage, type ProjectStage } from '../../domain/stages';
import type { Project } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { DemoTag, EmptyState, ErrorState, LoadingState, PageHeader } from '../../ui/primitives';

type FocusTarget = { projectId: string; control: 'next' | 'prev' | 'title' };

function focusCard(target: FocusTarget) {
  const card = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(target.projectId)}"]`);
  if (!card) return;
  const el =
    (target.control !== 'title' ? card.querySelector<HTMLElement>(`[data-move="${target.control}"]`) : null) ??
    card.querySelector<HTMLElement>('[data-card-title]');
  el?.focus();
  card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function ProjectCard({
  project,
  clientName,
  today,
  highlighted,
  onMove,
  busy,
}: {
  project: Project;
  clientName: string;
  today: string;
  highlighted: boolean;
  onMove: (p: Project, to: ProjectStage, control: 'next' | 'prev') => void;
  busy: boolean;
}) {
  const prev = previousStage(project.stage);
  const next = nextStage(project.stage);
  const late = project.dueDate !== null && project.dueDate < today && project.stage !== 'delivered' && project.stage !== 'archived';
  return (
    <li className={`card-tile${highlighted ? ' is-highlighted' : ''}`} data-card={project.id}>
      <p className="card-tile__kind">
        {PROJECT_KIND_LABEL[project.kind]}
        {project.demo ? <DemoTag /> : null}
      </p>
      <h3 className="card-tile__title">
        <Link to={`/projects/${project.id}`} data-card-title>
          {project.title}
        </Link>
      </h3>
      <p className="card-tile__client">{clientName}</p>
      {project.dueDate ? (
        <p className={`card-tile__due${late ? ' is-late' : ''}`}>
          <Icon name="clock" size={14} />
          <span className="num">{formatDate(project.dueDate, { short: true })}</span>
          <span className="muted">· {relativeDay(project.dueDate, today)}</span>
        </p>
      ) : null}
      {project.stage !== 'archived' ? (
        <div className="card-tile__moves">
          {prev ? (
            <button
              type="button"
              className="move move--prev"
              data-move="prev"
              aria-label={`החזרה לשלב ${STAGE_LABEL[prev]}`}
              disabled={busy}
              onClick={() => onMove(project, prev, 'prev')}
            >
              <Icon name="chevronStart" size={14} />
              {STAGE_LABEL[prev]}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button
              type="button"
              className="move move--next"
              data-move="next"
              aria-label={`העברה לשלב ${STAGE_LABEL[next]}`}
              disabled={busy}
              onClick={() => onMove(project, next, 'next')}
            >
              {STAGE_LABEL[next]}
              <Icon name="chevronEnd" size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ProjectsBoard() {
  const { repos, now } = useStudio();
  const { announce } = useAnnouncer();
  const [params] = useSearchParams();
  const focusId = params.get('focus');
  const [showArchive, setShowArchive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<FocusTarget | null>(focusId ? { projectId: focusId, control: 'title' } : null);
  const res = useResource(async (r) => ({ projects: await r.projects.list(), clients: await r.clients.list() }), []);
  const today = israelDate(now());

  useEffect(() => {
    if (res.status !== 'ready' || !pendingFocus) return;
    // Focus after the moved card re-rendered in its new column.
    const raf = requestAnimationFrame(() => {
      focusCard(pendingFocus);
      setPendingFocus(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [res, pendingFocus]);

  const onMove = async (project: Project, to: ProjectStage, control: 'next' | 'prev') => {
    setBusyId(project.id);
    try {
      await repos.projects.move(project.id, to);
      setPendingFocus({ projectId: project.id, control });
      announce(`״${project.title}״ הועבר לשלב ${STAGE_LABEL[to]}.`);
    } catch (e) {
      announce(errorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const header = (
    <PageHeader
      eyebrow="לוח"
      title="פרויקטים"
      description="כל עמודה היא שלב. מעבירים פרויקט שלב אחד קדימה או אחורה בכפתורים שבכרטיס, גם מהמקלדת."
      actions={
        <label className="check">
          <input type="checkbox" checked={showArchive} onChange={(e) => setShowArchive(e.target.checked)} />
          הצגת ארכיון
        </label>
      }
    />
  );
  if (res.status === 'loading') return (<>{header}<LoadingState label="טוען את הלוח…" rows={5} /></>);
  if (res.status === 'error') return (<>{header}<ErrorState error={res.error} onRetry={res.reload} /></>);

  const { projects, clients } = res.data;
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '';
  const columns: ProjectStage[] = showArchive ? [...FLOW_STAGES, 'archived'] : [...FLOW_STAGES];

  if (projects.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon="board" title="אין פרויקטים עדיין">
          פרויקט נוצר כשממירים ליד. התחילו מתיבת הלידים.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {header}
      {/* Scrollable region: focusable so keyboard users can scroll it (WCAG 2.1.1). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="board" role="region" aria-label="לוח שלבים" tabIndex={0}>
        {columns.map((stage) => {
          const inStage = projects.filter((p) => p.stage === stage);
          const headingId = `col-${stage}`;
          return (
            <section key={stage} className={`column column--${stage}`} aria-labelledby={headingId}>
              <h2 id={headingId} className="column__title">
                {STAGE_LABEL[stage]}
                <span className="column__count num">{inStage.length}</span>
              </h2>
              {inStage.length === 0 ? (
                <p className="column__empty">אין כאן פרויקטים</p>
              ) : (
                <ul className="column__list">
                  {inStage.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      clientName={clientName(p.clientId)}
                      today={today}
                      highlighted={p.id === focusId}
                      busy={busyId === p.id}
                      onMove={(proj, to, control) => void onMove(proj, to, control)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
