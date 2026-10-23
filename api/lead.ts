// Vercel Function (Node.js runtime, Web-standard fetch export). The rest of the site stays static.
// Logic lives in server/lead/* so it can be unit-tested and run locally.
import { createLeadHandler } from '../server/lead/handler';
import { depsFromEnv } from '../server/lead/config';

let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    handler ??= createLeadHandler(await depsFromEnv(process.env));
    return handler(request);
  },
};
