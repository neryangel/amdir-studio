// Tiny static server for local QA: node scripts/serve.mjs <dir> <port>
import http from 'node:http';
import handler from 'serve-handler';
const [dir = 'dist', port = '4321'] = process.argv.slice(2);
http
  .createServer((req, res) => handler(req, res, { public: dir, trailingSlash: true }))
  .listen(Number(port), '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port}/`));
