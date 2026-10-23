#!/usr/bin/env node
// Media ingest: one folder per work in inbox/ → previews, poster, optimized images, content entry.
//
//   node scripts/ingest.mjs [--inbox inbox] [--from 12.5] [--only <folder>] [--dry-run]
//
// Per work folder (any of): video files, images, notes.txt, info.json (see INTAKE.he.md).
// Optional inbox/intake.csv (from intake-template.csv): one row per folder; info.json wins on conflicts.
// Output (never overwrites anything that exists):
//   public/media/works/<slug>/preview.mp4|.webm   muted 6-10 s loop, 720p (H.264 faststart crf 28, VP9)
//   src/assets/works/<slug>/poster.jpg             poster frame (or the first image)
//   src/assets/works/<slug>/image-N.jpg            optimized images (originals stay in the inbox)
//   src/content/works/<slug>.yaml                  entry with needsReview: true, permissionToShow: false
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const inbox = path.resolve(root, opt('inbox', 'inbox'));
const fromArg = opt('from', undefined);
const only = opt('only', undefined);
const dryRun = args.includes('--dry-run');

const VIDEO = /\.(mp4|mov|m4v|mkv|webm|avi|mts)$/i;
const IMAGE = /\.(jpe?g|png|webp|tiff?|heic|avif)$/i;
const DISCIPLINES = ['clips', 'video', 'motion', 'ai', 'web', 'photo'];
const TYPES = ['client', 'personal', 'demo', 'concept'];
const TODO = '[להשלמה]';

function run(cmd, argv) {
  return execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function slugify(name) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (ascii.length >= 3) return ascii.slice(0, 60);
  return `work-${createHash('sha1').update(name).digest('hex').slice(0, 6)}`;
}

function titleFromFolder(name) {
  return name.replace(/^\d{4}[-_.]?\d{0,2}[-_.]?\d{0,2}[-_ ]*/, '').replace(/[-_]+/g, ' ').trim() || name;
}

// YAML via JSON-quoted scalars (valid YAML, keeps Hebrew readable).
function yamlValue(v, indent) {
  const pad = ' '.repeat(indent);
  if (v === null || v === undefined) return "''";
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `\n${v
      .map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const entries = Object.entries(item);
          return entries.map(([k, val], i) => `${pad}${i === 0 ? '- ' : '  '}${k}: ${yamlValue(val, indent + 4)}`).join('\n');
        }
        return `${pad}- ${yamlValue(item, indent + 2)}`;
      })
      .join('\n')}`;
  }
  return `\n${Object.entries(v)
    .map(([k, val]) => `${pad}${k}: ${yamlValue(val, indent + 2)}`)
    .join('\n')}`;
}
const toYaml = (obj) => `${Object.entries(obj).map(([k, v]) => `${k}: ${yamlValue(v, 2)}`).join('\n')}\n`;

function guessDisciplines(name, hasVideo, hasImages) {
  const n = name.toLowerCase();
  const d = new Set();
  if (/קליפ|clip|music|שיר/.test(n)) d.add('clips');
  if (/אתר|site|web|landing/.test(n)) d.add('web');
  if (/מושן|motion|after ?effects|vfx|אפקט/.test(n)) d.add('motion');
  if (/\bai\b|בינה/.test(n)) d.add('ai');
  if (hasVideo && !d.size) d.add('video');
  if (!hasVideo && hasImages && !d.size) d.add('photo');
  return [...d];
}

// Minimal CSV parser (quotes, commas, newlines in quotes). Used for inbox/intake.csv.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field), rows.push(row), (row = []), (field = '');
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [head = [], ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const yes = (v) => (/^(yes|true|כן|1)$/i.test(v) ? true : /^(no|false|לא|0)$/i.test(v) ? false : undefined);
const list = (v) => (v ? v.split('|').map((x) => x.trim()).filter(Boolean) : undefined);

/** intake.csv row → same shape as info.json (empty cells are ignored). */
function infoFromCsvRow(r) {
  const info = {};
  for (const k of ['slug', 'title', 'artist', 'client', 'type', 'summary', 'aiNote', 'websiteUrl', 'posterAlt']) if (r[k]) info[k] = r[k];
  for (const k of ['disciplines', 'deliverables', 'credits', 'tools']) if (list(r[k])) info[k] = list(r[k]);
  for (const k of ['aiUsed', 'musicLicensed', 'permissionToShow', 'featured']) if (yes(r[k] ?? '') !== undefined) info[k] = yes(r[k]);
  if (r.year && /^\d{4}$/.test(r.year)) info.year = Number(r.year);
  if (r.previewFrom && Number.isFinite(Number(r.previewFrom))) info.from = Number(r.previewFrom);
  if (r.permissionProof) info.permissionProof = r.permissionProof;
  return info;
}

async function probeDuration(file) {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const d = Number(out);
  if (!Number.isFinite(d) || d <= 0) throw new Error(`cannot read duration of ${file}`);
  return d;
}

function previewWindow(duration, from) {
  const len = Math.min(8, Math.max(Math.min(6, duration), Math.min(10, duration)));
  let start = from !== undefined ? Number(from) : duration * 0.1;
  if (!Number.isFinite(start) || start < 0) start = 0;
  if (start + len > duration) start = Math.max(0, duration - len);
  return { start: Number(start.toFixed(2)), len: Number(Math.min(len, duration - start).toFixed(2)) };
}

async function ingestWork(dir, csvRows) {
  const folder = path.basename(dir);
  const files = (await readdir(dir)).filter((f) => !f.startsWith('.'));
  let info = csvRows.has(folder) ? infoFromCsvRow(csvRows.get(folder)) : {};
  if (files.includes('info.json')) {
    try {
      info = { ...info, ...JSON.parse(await readFile(path.join(dir, 'info.json'), 'utf8')) };
    } catch (e) {
      return { folder, skipped: `info.json לא תקין: ${e.message}` };
    }
  }
  const notes = files.includes('notes.txt') ? (await readFile(path.join(dir, 'notes.txt'), 'utf8')).trim() : '';
  const videos = [];
  for (const f of files.filter((f) => VIDEO.test(f))) videos.push({ f, size: (await stat(path.join(dir, f))).size });
  videos.sort((a, b) => b.size - a.size);
  const images = files.filter((f) => IMAGE.test(f)).sort();
  if (!videos.length && !images.length) return { folder, skipped: 'אין קבצי וידאו או תמונות' };

  const slug = typeof info.slug === 'string' && /^[a-z0-9-]{3,60}$/.test(info.slug) ? info.slug : slugify(folder);
  const entryPath = path.join(root, 'src/content/works', `${slug}.yaml`);
  const assetDir = path.join(root, 'src/assets/works', slug);
  const mediaDir = path.join(root, 'public/media/works', slug);
  for (const p of [entryPath, assetDir, mediaDir]) {
    if (existsSync(p)) return { folder, slug, skipped: `כבר קיים: ${path.relative(root, p)} (לא דורסים)` };
  }
  if (dryRun) return { folder, slug, dryRun: true, videos: videos.map((v) => v.f), images };

  await mkdir(assetDir, { recursive: true });
  let preview;
  let window;
  if (videos[0]) {
    const src = path.join(dir, videos[0].f);
    const duration = await probeDuration(src);
    window = previewWindow(duration, fromArg ?? info.from);
    await mkdir(mediaDir, { recursive: true });
    const scale = "scale=-2:'min(720,ih)':flags=lanczos,fps=30,format=yuv420p";
    const common = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(window.start), '-t', String(window.len), '-i', src, '-an', '-vf', scale];
    run('ffmpeg', [...common, '-c:v', 'libx264', '-profile:v', 'high', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', path.join(mediaDir, 'preview.mp4')]);
    run('ffmpeg', [...common, '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', path.join(mediaDir, 'preview.webm')]);
    run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(window.start + window.len / 2), '-i', src, '-frames:v', '1', '-vf', "scale=-2:'min(1080,ih)'", '-q:v', '3', path.join(assetDir, 'poster.jpg')]);
    preview = { mp4: `/media/works/${slug}/preview.mp4`, webm: `/media/works/${slug}/preview.webm` };
  }

  const gallery = [];
  for (const [i, img] of images.entries()) {
    const out = path.join(assetDir, `image-${i + 1}.jpg`);
    await sharp(path.join(dir, img)).rotate().resize({ width: 2400, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
    const alt = info.alt && typeof info.alt[img] === 'string' ? info.alt[img] : `${TODO} תיאור התמונה ${img}`;
    gallery.push({ image: `../../assets/works/${slug}/image-${i + 1}.jpg`, alt });
  }
  if (!videos.length) {
    await sharp(path.join(assetDir, 'image-1.jpg')).toFile(path.join(assetDir, 'poster.jpg'));
  }

  const guessed = guessDisciplines(`${folder} ${notes}`, videos.length > 0, images.length > 0);
  const disciplines = Array.isArray(info.disciplines) && info.disciplines.every((d) => DISCIPLINES.includes(d)) ? info.disciplines : guessed;
  if (info.aiUsed === true && !disciplines.includes('ai')) disciplines.push('ai');
  const type = TYPES.includes(info.type) ? info.type : 'personal';
  const year = Number.isInteger(info.year) ? info.year : new Date((await stat(dir)).mtime).getFullYear();

  const entry = {
    title: typeof info.title === 'string' ? info.title : titleFromFolder(folder),
    artist: info.artist ?? '',
    client: info.client ?? '',
    type,
    disciplines,
    year,
    summary: typeof info.summary === 'string' ? info.summary : notes.split(/\n\s*\n/)[0] || `${TODO} המטרה: מה היה צריך לקרות`,
    deliverables: Array.isArray(info.deliverables) ? info.deliverables : [],
    credits: Array.isArray(info.credits) ? info.credits : [],
    tools: Array.isArray(info.tools) ? info.tools : [],
    aiUsed: info.aiUsed === true,
    aiNote: info.aiUsed === true && typeof info.aiNote === 'string' ? info.aiNote : '',
    outcome: { text: '', source: '' },
    poster: `../../assets/works/${slug}/poster.jpg`,
    posterAlt: typeof info.posterAlt === 'string' ? info.posterAlt : `${TODO} תיאור תמונת הפתיחה`,
    video: { discriminant: 'none' },
    preview: preview ?? { mp4: '', webm: '' },
    gallery,
    websiteUrl: info.websiteUrl ?? '',
    // Never true automatically: even if the table says yes, the owner confirms in review.
    permissionToShow: false,
    ...(typeof info.musicLicensed === 'boolean' ? { musicLicensed: info.musicLicensed } : {}),
    featured: false,
    order: 100,
    placeholder: false,
    needsReview: true,
  };
  await writeFile(entryPath, `# Created by scripts/ingest.mjs from inbox folder "${folder}". Review, then set needsReview: false.\n${toYaml(entry)}`, 'utf8');

  const checklist = [
    `כותרת: "${entry.title}"${info.title ? '' : ' (נלקחה משם התיקייה)'}`,
    `סוג: ${type}${TYPES.includes(info.type) ? '' : ' (ניחוש, לבדוק)'} · תחומים: ${disciplines.join(', ') || 'אין'}${info.disciplines ? '' : ' (ניחוש, לבדוק)'}`,
    entry.summary.startsWith(TODO) ? 'לכתוב את המטרה (אין notes.txt)' : 'לבדוק את המטרה (נלקחה מ-notes.txt)',
    'לכתוב טקסט חלופי לתמונת הפתיחה' + (gallery.length ? ` ול-${gallery.length} תמונות בגלריה` : ''),
    'קרדיטים וכלים',
    type === 'client'
      ? `אישור בכתב מהלקוח${info.permissionProof ? ` (בטבלה: ${info.permissionProof})` : ''}, ואז permissionToShow: true`
      : 'אם זו עבודת לקוח: לשנות סוג ולקבל אישור בכתב',
    disciplines.includes('clips') ? `רישוי מוזיקה: musicLicensed${typeof info.musicLicensed === 'boolean' ? ` = ${info.musicLicensed}` : ' לא מולא'}` : null,
    info.aiUsed === true ? 'AI: לבדוק את משפט ה-aiNote' : 'AI: לא סומן. אם היה שימוש, לסמן aiUsed ולכתוב aiNote',
    videos.length ? 'להעלות את הסרטון המלא ל-Bunny Stream ולמלא video (bunny + מזהה)' : null,
    window ? `תצוגה מקדימה: ${window.start}s עד ${(window.start + window.len).toFixed(1)}s. אם הקטע לא טוב: למחוק את התיקייה ולהריץ שוב עם --from` : null,
    videos.length > 1 ? `יש ${videos.length} סרטונים. נלקח הגדול: ${videos[0]?.f}` : null,
    'בסוף: needsReview: false',
  ].filter(Boolean);
  return { folder, slug, created: path.relative(root, entryPath), checklist };
}

if (!existsSync(inbox)) {
  console.error(`אין תיקייה ${path.relative(root, inbox) || inbox}. ראו INTAKE.he.md`);
  process.exit(1);
}
const csvPath = path.join(inbox, 'intake.csv');
const csvRows = new Map(existsSync(csvPath) ? parseCsv(await readFile(csvPath, 'utf8')).filter((r) => r.folder).map((r) => [r.folder, r]) : []);
if (csvRows.size) console.log(`נקראו ${csvRows.size} שורות מ-intake.csv`);
const folders = (await readdir(inbox, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('.') && (!only || d.name === only));
let created = 0;
for (const d of folders) {
  let r;
  try {
    r = await ingestWork(path.join(inbox, d.name), csvRows);
  } catch (e) {
    r = { folder: d.name, skipped: `שגיאה: ${e.message}` };
  }
  console.log(`\n■ ${r.folder}${r.slug ? `  →  ${r.slug}` : ''}`);
  if (r.skipped) console.log(`  דילוג: ${r.skipped}`);
  else if (r.dryRun) console.log(`  (dry run) וידאו: ${r.videos.join(', ') || 'אין'} · תמונות: ${r.images.join(', ') || 'אין'}`);
  else {
    created++;
    console.log(`  נוצר: ${r.created}`);
    console.log('  רשימת בדיקה:');
    for (const item of r.checklist) console.log(`   [ ] ${item}`);
  }
}
console.log(`\n${created} עבודות נוצרו מתוך ${folders.length} תיקיות. הכול מסומן needsReview: true ולא ייכנס לבניית ייצור עד הבדיקה.`);
