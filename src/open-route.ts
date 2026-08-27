import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type ByteRange = { start: number; end: number };

// Parse a single-range `Range: bytes=…` header against a known file size. Returns undefined when
// there is no range to honor (absent header, or a form this route does not implement — multi-range
// requests included, which callers may always answer with the whole body), and 'unsatisfiable' when
// the requested window falls outside the file.
export function parseByteRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return undefined;
  // A suffix range (`bytes=-500`) asks for the file's final N bytes.
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
  const end = rawStart && rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  if (size === 0 || start > end || start >= size) return 'unsatisfiable';
  return { start, end };
}

// Serve one file from the controller's open-file allow-list. The caller has already checked the
// session token, the request origin, and that the id maps to a registered path — this function only
// decides how much of the file to send, so range serving never widens what is reachable.
//
// A satisfiable `Range` request streams just that byte window, which is what makes seeking work in a
// video tab without buffering a multi-gigabyte file into memory. Without a `Range` header the whole
// body is answered exactly as before, so images, markdown, and the editor are unaffected.
export async function serveOpenFile(
  request: IncomingMessage, res: ServerResponse, filePath: string, headers: Record<string, string>,
): Promise<void> {
  let size: number;
  try {
    const stats = await stat(filePath);
    size = stats.size;
  } catch {
    res.writeHead(404, { ...headers, 'accept-ranges': 'bytes' }).end();
    return;
  }

  const range = parseByteRange(request.headers.range, size);

  if (range === 'unsatisfiable') {
    res.writeHead(416, { ...headers, 'accept-ranges': 'bytes', 'content-range': `bytes */${size}` }).end();
    return;
  }

  if (range) {
    res.writeHead(206, {
      ...headers,
      'accept-ranges': 'bytes',
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
      'content-length': String(range.end - range.start + 1),
    });
    createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  let bytes: Buffer;
  try { bytes = await readFile(filePath); }
  catch {
    res.writeHead(500, { ...headers, 'accept-ranges': 'bytes' }).end();
    return;
  }
  res.writeHead(200, { ...headers, 'accept-ranges': 'bytes' });
  res.end(bytes);
}
