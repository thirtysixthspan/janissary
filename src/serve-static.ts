import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { serveOpenFile } from './open/route.js';
import { originAllowed, tokenFromReq as tokenFromRequest, tokenMatches } from './security.js';
import { tabPluginCatalog } from './plugins/catalog.js';
import { pluginContentTypes } from './plugins/opener-adapter.js';
import { pluginOpeners } from './openers/index.js';

// Applied to every HTTP response: defence-in-depth for the XSS path and token leak.
const SECURITY_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-src https: http:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
} as const;

const MIME: Record<string, string> = {
  // Plugin claims come first so every core entry below overrides them. Accepted plugin claims only
  // prove that no core *opener* owns the extension, and this map also serves the web UI's own
  // assets — so core precedence has to hold uniformly rather than by where a line happens to sit.
  ...pluginContentTypes(tabPluginCatalog, pluginOpeners),
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
  // Text types with their own registered MIME, served via the `/open/<id>` route (editor opener).
  '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.xml': 'application/xml',
  '.csv': 'text/csv; charset=utf-8',
  // The rest of the editor opener's plain-text extensions all serve as text/plain.
  ...Object.fromEntries([
    '.txt', '.text', '.log', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.env',
    '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.java',
    '.sh', '.bash', '.zsh', '.sql',
  ].map((extension) => [extension, 'text/plain; charset=utf-8'])),
};

export type StaticFileServerOptions = {
  // The built web UI's directory. Unknown paths fall back to its `index.html`, which is what makes
  // an SPA route and a missing asset answer the same way.
  webDir: string;
  // The session token, which is what the `/open/<id>` route is guarded by.
  token: string;
  // The controller's allow-list lookup: a file id resolves to a path or to nothing, so an arbitrary
  // local path is never reachable through the route.
  openFilePath: (id: string) => string | undefined;
};

// Everything the app answers over HTTP: the web UI's own bundle, and a file the app opened, served
// by id from the controller's allow-list. Separated from the server that wires it up so the content
// types and the security headers live beside what they govern rather than inside the boot sequence.
export function staticFileServer(options: StaticFileServerOptions) {
  return async (request: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!originAllowed(request)) { res.writeHead(403).end('forbidden'); return; }
    const urlPath = new URL(request.url ?? '/', 'http://localhost').pathname;
    // A file explicitly opened in the app (`open <file>`). Guarded by the session token and served
    // only from the controller's allow-list — an arbitrary local path is never reachable.
    if (urlPath.startsWith('/open/')) {
      if (!tokenMatches(options.token, tokenFromRequest(request))) { res.writeHead(403).end('forbidden'); return; }
      const id = decodeURIComponent(urlPath.slice('/open/'.length));
      const filePath = options.openFilePath(id);
      if (!filePath) { res.writeHead(404).end('not found'); return; }
      await serveOpenFile(request, res, filePath, {
        ...SECURITY_HEADERS,
        'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      });
      return;
    }
    // Resolve within webDir; fall back to index.html for SPA routes / unknown assets.
    const rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^\/+/, '');
    let file = path.join(options.webDir, rel || 'index.html');
    if (!file.startsWith(options.webDir)) file = path.join(options.webDir, 'index.html');
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      try { body = await readFile(path.join(options.webDir, 'index.html')); file = 'index.html'; }
      catch { res.writeHead(404).end('not found'); return; }
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  };
}
