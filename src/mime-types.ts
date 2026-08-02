// The content types the host owns, for both static web assets and the `/open/<id>` route. Kept in
// a leaf module with no imports so the plugin catalog can check a declaration's MIME claims against
// it without pulling in the server.
//
// Plugin claims are composed on top of this table (see `mimeTypes()`), but may never replace an
// entry: a claim on an extension listed here is a catalog error that disables the declaration.
export const CORE_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
  // Image types served via the `/open/<id>` route (opened files).
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
  // Markdown files served via the `/open/<id>` route.
  '.md': 'text/markdown; charset=utf-8', '.markdown': 'text/markdown; charset=utf-8',
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
