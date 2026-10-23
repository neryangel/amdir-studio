// Creates inbox-sample/ with 2 synthetic clips (ffmpeg testsrc + sine) and a test image,
// to exercise scripts/ingest.mjs without real material. Not real work.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const inbox = path.join(root, 'inbox-sample');
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a]);

const a = path.join(inbox, 'קליפ בדיקה סינתטי');
await mkdir(a, { recursive: true });
ff('-f', 'lavfi', '-i', 'smptehdbars=size=1280x720:rate=30:duration=14,drawbox=x=t*80:y=300:w=120:h=120:color=0xe5397f@0.9:t=fill', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=14',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-c:a', 'aac', '-shortest', path.join(a, 'master.mp4'));
await writeFile(path.join(a, 'notes.txt'), 'קליפ סינתטי לבדיקת הסקריפט. אין כאן עבודה אמיתית.\n\nפסקה שנייה שלא נכנסת לתקציר.\n');
await writeFile(path.join(a, 'info.json'), JSON.stringify({
  slug: 'sample-synthetic-clip', type: 'personal', disciplines: ['clips', 'motion'], aiUsed: true,
  aiNote: 'בדיקה: סימון AI מגיע רק מ-info.json', musicLicensed: false, credits: ['עריכה'], tools: ['ffmpeg'],
}, null, 2));

const b = path.join(inbox, 'sample-edit-reel');
await mkdir(b, { recursive: true });
ff('-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=25:duration=20', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=20',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-c:a', 'aac', '-shortest', path.join(b, 'edit.mov'));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c3d5a"/><stop offset="1" stop-color="#e5397f"/></linearGradient></defs><rect width="2400" height="1600" fill="url(#g)"/><circle cx="1600" cy="600" r="380" fill="#ffffff" opacity=".18"/></svg>`;
await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(path.join(b, 'still-01.jpg'));
console.log('inbox-sample/ ready: 2 clips + 1 image');
