import { addDays, israelDate } from '../domain/dates';
import type { StudioLeadRow } from '../domain/lead';
import { leadFromStudioRow } from '../domain/lead';
import type { ProjectStage } from '../domain/stages';
import { FLOW_STAGES } from '../domain/stages';
import type {
  Asset,
  AssetVersion,
  Client,
  Delivery,
  IsoDateTime,
  Lead,
  Milestone,
  Project,
  ProjectKind,
  Quote,
  QuoteLine,
  ReviewComment,
  Task,
} from '../domain/types';
import type { StudioSnapshot } from './repositories';

/**
 * Deterministic demo seed. Same `now` → identical output (ids are fixed strings, dates are offsets
 * from the Israel calendar day of `now`), so the dashboard always has something due "today".
 * Every record is `demo: true`. All people and businesses are obviously fictional; contacts use
 * the reserved `.invalid` domain and 050-000xxxx numbers.
 */
export function buildDemoSeed(now: IsoDateTime): StudioSnapshot {
  const today = israelDate(now);
  const nowMs = Date.parse(now);
  const at = (dayOffset: number, hour = 10): IsoDateTime =>
    new Date(Date.parse(`${addDays(today, dayOffset)}T00:00:00.000Z`) + (hour - 3) * 3_600_000).toISOString();
  const day = (offset: number) => addDays(today, offset);
  const base = (id: string, createdOffset: number) => ({ id, demo: true, createdAt: at(createdOffset), updatedAt: at(createdOffset) });

  // ---------- Leads, through the same ingest path as real site leads ----------
  const leadRows: StudioLeadRow[] = [
    {
      id: 'demo-lead-1',
      created_at: new Date(nowMs - 26 * 3_600_000).toISOString(),
      source: 'contact',
      name: 'פונה לדוגמה ד׳',
      contact: 'demo-d@example.invalid',
      contact_type: 'email',
      need: 'clip',
      details: 'אני מוציא סינגל בעוד חודשיים ומחפש קליפ בתקציב צנוע. יש לי רעיון לצילום בלילה בעיר.',
      brief: { songUrl: 'https://example.invalid/demo-song', releaseDate: day(60).slice(0, 7) },
      privacy_consent: true,
      marketing_opt_in: false,
      notice_version: 'lead-notice-2026-10-23',
      consent_at: new Date(nowMs - 26 * 3_600_000).toISOString(),
      status: 'new',
    },
    {
      id: 'demo-lead-2',
      created_at: new Date(nowMs - 5 * 3_600_000).toISOString(),
      source: 'contact',
      name: 'עסק לדוגמה ה׳',
      contact: '050-0000005',
      contact_type: 'phone',
      need: 'web',
      details: 'צריכים אתר חדש לעסק, עם טופס לקביעת פגישות. האתר הנוכחי ישן ולא מותאם לטלפון.',
      brief: { currentSiteUrl: 'https://example.invalid', siteGoal: 'leads', desiredDate: day(45).slice(0, 7) },
      privacy_consent: true,
      marketing_opt_in: true,
      notice_version: 'lead-notice-2026-10-23',
      consent_at: new Date(nowMs - 5 * 3_600_000).toISOString(),
      status: 'new',
    },
    {
      id: 'demo-lead-3',
      created_at: new Date(nowMs - 50 * 60_000).toISOString(),
      source: 'pilot',
      name: 'מפיקה לדוגמה ו׳',
      contact: 'demo-v@example.invalid',
      contact_type: 'email',
      need: 'pilot',
      details: 'מתעניינת בפיילוט של Event Pro Studio לאירועים שלנו.',
      brief: { eventsPerYear: '11-30', currentTools: 'גיליון אקסל ווואטסאפ' },
      privacy_consent: true,
      marketing_opt_in: false,
      notice_version: 'lead-notice-2026-10-23',
      consent_at: new Date(nowMs - 50 * 60_000).toISOString(),
      status: 'new',
    },
    {
      id: 'demo-lead-4',
      created_at: at(-6),
      source: 'contact',
      name: 'אמן לדוגמה ז׳',
      contact: 'demo-z@example.invalid',
      contact_type: 'email',
      need: 'ai',
      details: 'ויז׳ואלים למסך LED בהופעה. שלחתי רפרנסים במייל.',
      brief: { referenceUrl: 'https://example.invalid/refs' },
      privacy_consent: true,
      marketing_opt_in: false,
      notice_version: 'lead-notice-2026-10-23',
      consent_at: at(-6),
      status: 'replied',
    },
    {
      id: 'demo-lead-5',
      created_at: at(-3),
      source: 'contact',
      name: 'בדיקה',
      contact: 'spam@example.invalid',
      contact_type: 'email',
      need: 'other',
      details: 'הצעה לקידום אתרים במחיר מיוחד!!!',
      brief: null,
      privacy_consent: true,
      marketing_opt_in: false,
      notice_version: 'lead-notice-2026-10-23',
      consent_at: at(-3),
      status: 'spam',
    },
  ];
  const leads: Lead[] = leadRows.map((r) => {
    const res = leadFromStudioRow(r, { demo: true });
    if (!res.ok) throw new Error(`Demo seed lead ${r.id} is invalid: ${res.errors.join(', ')}`);
    return res.lead;
  });

  // ---------- Clients ----------
  const clients: Client[] = [
    {
      ...base('demo-cli-a', -120),
      name: 'לקוח לדוגמה א׳',
      company: null,
      taxId: null,
      email: 'demo-a@example.invalid',
      phone: '050-0000001',
      notes: 'מוזיקאי. מעדיף וואטסאפ. אוהב צבעים חמים.',
      sourceLeadId: null,
      portalEnabled: true,
    },
    {
      ...base('demo-cli-b', -90),
      name: 'להקה לדוגמה ב׳',
      company: null,
      taxId: null,
      email: 'demo-b@example.invalid',
      phone: null,
      notes: 'איש הקשר הוא המתופף.',
      sourceLeadId: null,
      portalEnabled: false,
    },
    {
      ...base('demo-cli-c', -60),
      name: 'איש קשר לדוגמה ג׳',
      company: 'חברה לדוגמה ג׳ בע״מ',
      taxId: '000000000',
      email: 'demo-c@example.invalid',
      phone: '050-0000003',
      notes: 'צריך חשבונית מס על שם החברה.',
      sourceLeadId: null,
      portalEnabled: true,
    },
    {
      ...base('demo-cli-h', -40),
      name: 'מפיק לדוגמה ח׳',
      company: 'הפקות לדוגמה ח׳',
      taxId: '000000001',
      email: 'demo-h@example.invalid',
      phone: '050-0000008',
      notes: '',
      sourceLeadId: null,
      portalEnabled: false,
    },
  ];

  // ---------- Projects ----------
  const historyTo = (stage: ProjectStage, startOffset: number) => {
    const target = stage === 'archived' ? 'delivered' : stage;
    const idx = FLOW_STAGES.indexOf(target);
    const history: Project['stageHistory'][number][] = [{ from: null, to: 'inquiry', at: at(startOffset) }];
    for (let i = 1; i <= idx; i += 1) {
      history.push({ from: FLOW_STAGES[i - 1] ?? null, to: FLOW_STAGES[i] as ProjectStage, at: at(startOffset + i * 4) });
    }
    if (stage === 'archived') history.push({ from: 'delivered', to: 'archived', at: at(startOffset + idx * 4 + 2) });
    return history;
  };
  const project = (
    id: string,
    clientId: string,
    title: string,
    kind: ProjectKind,
    stage: ProjectStage,
    startOffset: number,
    dueOffset: number | null,
    summary: string,
  ): Project => ({
    ...base(id, startOffset),
    clientId,
    title,
    kind,
    stage,
    stageBeforeArchive: stage === 'archived' ? 'delivered' : null,
    stageHistory: historyTo(stage, startOffset),
    summary,
    dueDate: dueOffset === null ? null : day(dueOffset),
  });

  const projects: Project[] = [
    project('demo-prj-1', 'demo-cli-a', 'קליפ לסינגל ״גלים״', 'clip', 'post', -30, 9, 'קליפ לילי בעיר, שני ימי צילום, צבע חם.'),
    project('demo-prj-2', 'demo-cli-c', 'אתר תדמית לחברה', 'web', 'production', -25, 21, 'אתר חמישה עמודים עם טופס לידים וניהול תוכן.'),
    project('demo-prj-3', 'demo-cli-h', 'פתיח מושן לכנס', 'motion', 'review', -20, 3, 'פתיח של 30 שניות, לוגו מונפש ומוזיקה.'),
    project('demo-prj-4', 'demo-cli-b', 'עריכת הופעה חיה', 'video', 'proposal', -4, null, 'עריכה של הופעה מצולמת בשלוש מצלמות.'),
    project('demo-prj-5', 'demo-cli-b', 'ויז׳ואלים לסיבוב הופעות', 'visuals', 'pre-production', -12, 30, 'לופים למסך LED לשמונה שירים.'),
    project('demo-prj-6', 'demo-cli-a', 'קליפ קודם ״אור״', 'clip', 'delivered', -110, null, 'נמסר. ממתין לפרסום אצל הלקוח.'),
    project('demo-prj-7', 'demo-cli-c', 'סרטון מוצר ישן', 'video', 'archived', -200, null, 'הושלם בעבר.'),
    project('demo-prj-8', 'demo-cli-h', 'טיזר לאירוע השקה', 'video', 'inquiry', -1, null, 'שיחת היכרות נקבעה.'),
  ];

  // ---------- Tasks ----------
  const task = (id: string, projectId: string, title: string, dueOffset: number | null, done = false): Task => ({
    ...base(id, -10),
    projectId,
    title,
    dueDate: dueOffset === null ? null : day(dueOffset),
    done,
    doneAt: done ? at(-1) : null,
  });
  const tasks: Task[] = [
    task('demo-tsk-1', 'demo-prj-1', 'תיקוני צבע לפי הערות הלקוח', -2),
    task('demo-tsk-2', 'demo-prj-1', 'ייצוא גרסה 3 לבדיקה', 0),
    task('demo-tsk-3', 'demo-prj-1', 'סנכרון כתוביות', 4),
    task('demo-tsk-4', 'demo-prj-2', 'עיצוב עמוד הבית במובייל', -1),
    task('demo-tsk-5', 'demo-prj-2', 'חיבור טופס הלידים', 6),
    task('demo-tsk-6', 'demo-prj-2', 'איסוף טקסטים מהלקוח', -5, true),
    task('demo-tsk-7', 'demo-prj-3', 'החלפת המוזיקה לגרסה המאושרת', -3),
    task('demo-tsk-8', 'demo-prj-5', 'לוח השראה לשיר הפתיחה', 2),
    task('demo-tsk-9', 'demo-prj-4', 'הכנת הצעת מחיר', 0),
    task('demo-tsk-10', 'demo-prj-7', 'משימה ישנה בארכיון', -60),
  ];

  // ---------- Milestones ----------
  const milestone = (id: string, projectId: string, title: string, offset: number, done = false, clientVisible = true): Milestone => ({
    ...base(id, -20),
    projectId,
    title,
    date: day(offset),
    done,
    clientVisible,
  });
  const milestones: Milestone[] = [
    milestone('demo-mil-1', 'demo-prj-1', 'יום צילום ראשון', -18, true),
    milestone('demo-mil-2', 'demo-prj-1', 'גרסה ראשונה ללקוח', -6, true),
    milestone('demo-mil-3', 'demo-prj-1', 'מסירה סופית', 9),
    milestone('demo-mil-4', 'demo-prj-2', 'אישור עיצוב', 2),
    milestone('demo-mil-5', 'demo-prj-2', 'עלייה לאוויר', 21),
    milestone('demo-mil-6', 'demo-prj-3', 'הקרנה בכנס', 3),
    milestone('demo-mil-7', 'demo-prj-5', 'הופעה ראשונה בסיבוב', 30),
  ];

  // ---------- Quotes ----------
  const qline = (id: string, description: string, quantity: number, unitShekels: number): QuoteLine => ({
    id,
    description,
    quantity,
    unitPrice: unitShekels * 100,
  });
  const quote = (id: string, projectId: string, clientId: string, number: string, title: string, partial: Partial<Quote>): Quote => ({
    ...base(id, -15),
    projectId,
    clientId,
    number,
    title,
    lines: [],
    discount: 0,
    vatRate: 1800,
    status: 'draft',
    issuedOn: day(-15),
    validUntil: day(15),
    sentAt: null,
    acceptedAt: null,
    paid: 0,
    paymentLinkId: null,
    invoice: null,
    ...partial,
  });
  const quotes: Quote[] = [
    quote('demo-q-1', 'demo-prj-1', 'demo-cli-a', 'Q-DEMO-001', 'קליפ לסינגל', {
      lines: [qline('l1', 'יום צילום (צלם ותאורה)', 2, 3_500), qline('l2', 'עריכה וצבע', 1, 4_200), qline('l3', 'ציוד ולוקיישן', 1, 900)],
      discount: 50_000,
      status: 'accepted',
      sentAt: at(-15),
      acceptedAt: at(-13),
      paid: 708_000,
    }),
    quote('demo-q-2', 'demo-prj-2', 'demo-cli-c', 'Q-DEMO-002', 'אתר תדמית', {
      lines: [qline('l1', 'אפיון ועיצוב', 1, 6_000), qline('l2', 'פיתוח חמישה עמודים', 5, 1_400), qline('l3', 'הדרכה על ניהול התוכן', 1.5, 400)],
      status: 'accepted',
      sentAt: at(-14),
      acceptedAt: at(-12),
      paid: 0,
    }),
    quote('demo-q-3', 'demo-prj-3', 'demo-cli-h', 'Q-DEMO-003', 'פתיח מושן', {
      lines: [qline('l1', 'אנימציית לוגו ופתיח 30 שניות', 1, 4_800)],
      status: 'accepted',
      sentAt: at(-19),
      acceptedAt: at(-18),
      paid: 566_400,
    }),
    quote('demo-q-4', 'demo-prj-4', 'demo-cli-b', 'Q-DEMO-004', 'עריכת הופעה', {
      lines: [qline('l1', 'עריכה רב-מצלמתית', 1, 3_200), qline('l2', 'מיקס סאונד בסיסי', 1, 800)],
      status: 'sent',
      sentAt: at(-2),
    }),
    quote('demo-q-5', 'demo-prj-5', 'demo-cli-b', 'Q-DEMO-005', 'ויז׳ואלים', {
      lines: [qline('l1', 'לופ ויז׳ואלי לשיר', 8, 650)],
      status: 'draft',
    }),
  ];

  // ---------- Assets, versions, review comments ----------
  const asset = (id: string, projectId: string, title: string, kind: Asset['kind']): Asset => ({ ...base(id, -10), projectId, title, kind });
  const assets: Asset[] = [
    asset('demo-ast-1', 'demo-prj-1', 'קליפ ״גלים״, עריכה', 'video'),
    asset('demo-ast-2', 'demo-prj-3', 'פתיח לכנס', 'video'),
    asset('demo-ast-3', 'demo-prj-2', 'עיצוב עמוד הבית', 'image'),
    asset('demo-ast-4', 'demo-prj-6', 'קליפ ״אור״, מאסטר', 'video'),
  ];
  const version = (
    id: string,
    assetId: string,
    number: number,
    status: AssetVersion['status'],
    fileName: string,
    sizeBytes: number,
    durationMs: number | null,
    createdOffset: number,
    note = '',
  ): AssetVersion => ({
    ...base(id, createdOffset),
    assetId,
    number,
    status,
    fileName,
    sizeBytes,
    durationMs,
    storageRef: `demo/${assetId}/v${number}`,
    note,
  });
  const versions: AssetVersion[] = [
    version('demo-ver-1', 'demo-ast-1', 1, 'changes-requested', 'galim_v1.mp4', 734_003_200, 212_000, -8, 'גרסה ראשונה לבדיקה'),
    version('demo-ver-2', 'demo-ast-1', 2, 'changes-requested', 'galim_v2.mp4', 742_391_808, 212_000, -3, 'אחרי תיקוני קצב'),
    version('demo-ver-3', 'demo-ast-2', 1, 'awaiting-client', 'opener_v1.mov', 1_288_490_188, 30_000, -2),
    version('demo-ver-4', 'demo-ast-3', 1, 'approved', 'home_v1.png', 2_457_600, null, -9),
    version('demo-ver-5', 'demo-ast-3', 2, 'draft', 'home_v2.png', 2_621_440, null, -1, 'גרסת מובייל'),
    version('demo-ver-6', 'demo-ast-4', 1, 'approved', 'or_master.mov', 3_221_225_472, 198_000, -100),
  ];
  const comment = (
    id: string,
    versionId: string,
    author: ReviewComment['author'],
    body: string,
    timecodeMs: number | null,
    resolved: boolean,
    offset: number,
  ): ReviewComment => ({ ...base(id, offset), versionId, author, body, timecodeMs, resolved });
  const comments: ReviewComment[] = [
    comment('demo-cmt-1', 'demo-ver-1', 'client', 'הפתיח ארוך מדי, אפשר לקצר בחצי?', 4_200, true, -7),
    comment('demo-cmt-2', 'demo-ver-2', 'client', 'הצבע בסצנת הגשר כהה מדי.', 95_500, false, -2),
    comment('demo-cmt-3', 'demo-ver-2', 'client', 'אפשר להחליף את השוט של הרחוב בשוט מהגג?', 141_040, false, -2),
    comment('demo-cmt-4', 'demo-ver-2', 'owner', 'אבדוק את חומרי הגלם מהגג.', 141_040, false, -1),
    comment('demo-cmt-5', 'demo-ver-3', 'client', 'הלוגו צריך להיות קצת יותר גדול בסוף.', 27_300, false, -1),
  ];

  const deliveries: Delivery[] = [
    { ...base('demo-dlv-1', -100), projectId: 'demo-prj-6', versionIds: ['demo-ver-6'], deliveredAt: at(-100), note: 'מאסטר ProRes וגרסה לרשתות.' },
  ];

  return { leads, clients, projects, tasks, milestones, quotes, assets, versions, comments, deliveries };
}
