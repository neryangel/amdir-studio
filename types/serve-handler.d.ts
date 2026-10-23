declare module 'serve-handler' {
  import type { IncomingMessage, ServerResponse } from 'node:http';
  export default function handler(
    request: IncomingMessage,
    response: ServerResponse,
    options?: { public?: string; cleanUrls?: boolean; trailingSlash?: boolean },
  ): Promise<void>;
}
