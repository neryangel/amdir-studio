// Review build: placeholders visible + design-direction switcher, into dist-review/.
// Optional sub-path hosting: REVIEW_BASE=/review/ npm run build:review
import { execFileSync } from 'node:child_process';

const env = {
  ...process.env,
  PUBLIC_REVIEW_MODE: 'true',
  PUBLIC_SHOW_PLACEHOLDERS: 'true',
  PUBLIC_BASE_PATH: process.env.REVIEW_BASE || process.env.PUBLIC_BASE_PATH || '/',
};
const outDir = process.env.REVIEW_OUT || 'dist-review';
execFileSync('npx', ['astro', 'build', '--outDir', outDir], { stdio: 'inherit', env });
console.log(`\nReview build ready in ${outDir}/ (base ${env.PUBLIC_BASE_PATH})`);
