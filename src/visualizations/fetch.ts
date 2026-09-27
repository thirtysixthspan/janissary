import { readFileSync, statSync } from 'node:fs';
import { parseSource, type SourceRef } from './source.js';

// Every bound this module sets exists because a source is a line the user pasted, and a line the
// user pasted must not be able to make the server read the whole disk, wait forever, or hang on a
// redirect loop. They are stated here as named constants rather than as literals at their use sites
// so the ceilings are one edit, and so a reader can see all of them at once.
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;

type FetchLike = (url: string, init: { redirect: 'manual'; signal: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

type ReadOptions = { fetchImpl?: FetchLike; maxBytes?: number; timeoutMs?: number };

type ReadResult = { text: string } | { error: string };

type Response = Awaited<ReturnType<FetchLike>>;

// A local file is read whole once its size is known to be inside the cap, so a large file is refused
// by a stat rather than by buffering it and then noticing.
function readFile(ref: SourceRef & { kind: 'file' }, maxBytes: number): ReadResult {
  let size: number;
  try {
    size = statSync(ref.path).size;
  } catch (error) {
    return { error: `cannot read ${ref.path}: ${message(error)}` };
  }
  if (size > maxBytes) return { error: `${ref.path} is larger than the ${maxBytes} byte limit` };
  try {
    return { text: readFileSync(ref.path, 'utf8') };
  } catch (error) {
    return { error: `cannot read ${ref.path}: ${message(error)}` };
  }
}

async function readBody(url: string, response: Response, maxBytes: number): Promise<ReadResult> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    return { error: `cannot read ${url}: ${message(error)}` };
  }
  return Buffer.byteLength(text, 'utf8') > maxBytes
    ? { error: `${url} is larger than the ${maxBytes} byte limit` }
    : { text };
}

// Follows redirects by hand rather than letting the runtime do it, because the runtime's limit is its
// own and the number of hops is part of the bound. A hop is subject to the same checks as the first
// request, and one that resolves to anything but an http address ends it: a redirect is not a way to
// reach a place the source line itself could not name.
async function readUrl(url: string, options: Required<ReadOptions>): Promise<ReadResult> {
  let target = url;
  for (let hops = 0; ; hops += 1) {
    let response: Response;
    try {
      response = await options.fetchImpl(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      return { error: `cannot fetch ${target}: ${message(error)}` };
    }
    if (response.status < 300 || response.status >= 400) {
      if (response.status < 200 || response.status >= 300) {
        return { error: `${target} returned ${response.status}` };
      }
      return readBody(target, response, options.maxBytes);
    }
    const location = response.headers.get('location');
    if (!location) return { error: `${target} redirected with no location` };
    const next = redirectedTo(target, location);
    if ('error' in next) return next;
    if (hops === MAX_REDIRECTS) return { error: `${next.url} redirected too many times` };
    target = next.url;
  }
}

function redirectedTo(from: string, location: string): { url: string } | { error: string } {
  const unusable = { error: `${from} redirected to an unusable location` };
  let resolved: string;
  try {
    resolved = new URL(location, from).href;
  } catch {
    return unusable;
  }
  const parsed = parseSource(resolved);
  return 'error' in parsed || parsed.kind !== 'url' ? unusable : { url: parsed.url };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Reads a source and returns its text, or the reason it could not be read. Nothing here throws at the
// caller: a source that will not read is an ordinary outcome the caller records on the record and
// shows in the tab, and a thrown error would be indistinguishable from a bug in this module.
export async function readSource(line: string, options: ReadOptions = {}): Promise<ReadResult> {
  const parsed = parseSource(line);
  if ('error' in parsed) return parsed;
  const resolved: Required<ReadOptions> = {
    fetchImpl: options.fetchImpl ?? ((url, init) => fetch(url, init)),
    maxBytes: options.maxBytes ?? MAX_BYTES,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
  };
  return parsed.kind === 'file' ? readFile(parsed, resolved.maxBytes) : readUrl(parsed.url, resolved);
}
