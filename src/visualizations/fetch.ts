import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseSource, type SourceRef, type SourceRoots } from './source.js';

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

type ReadOptions = { roots: SourceRoots; fetchImpl?: FetchLike; maxBytes?: number; timeoutMs?: number };

type ReadResult = { text: string } | { error: string };

type Response = Awaited<ReturnType<FetchLike>>;

// A local file is refused twice over. The size check keeps a large file from being read at all, and the
// containment check keeps a path from resolving out of the roots `parseSource` accepted it for: the
// reader's contract is that a `SourceRef` it is handed has been checked, and a symlink is the one way
// a checked path can still turn out to point somewhere else, so the link is resolved before the read.
function readFile(ref: SourceRef & { kind: 'file' }, options: Required<ReadOptions>): ReadResult {
  const target = resolvedTarget(ref.path, options.roots);
  if ('error' in target) return target;
  const file = target.path;
  let size: number;
  try {
    size = statSync(file).size;
  } catch (error) {
    return { error: `cannot read ${ref.path}: ${message(error)}` };
  }
  if (size > options.maxBytes) return { error: `${ref.path} is larger than the ${options.maxBytes} byte limit` };
  try {
    return { text: readFileSync(file, 'utf8') };
  } catch (error) {
    return { error: `cannot read ${ref.path}: ${message(error)}` };
  }
}

// A file that does not exist has no real path to resolve, so the literal one is used and the read below
// reports it as missing. A file that does is resolved through its symlinks first, then held to the same
// roots — that is what catches a link pointing out of the tree, which no check on the literal path can.
function resolvedTarget(target: string, roots: SourceRoots): { path: string } | { error: string } {
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    return { path: target };
  }
  if (!insideRoots(real, roots)) {
    return { error: `${target} resolves outside the project directory and your home directory` };
  }
  return { path: real };
}

function insideRoots(candidate: string, roots: SourceRoots): boolean {
  return [roots.project, roots.home].some((root) => {
    const base = path.resolve(root);
    return candidate === base || candidate.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
  });
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
  if (!/^https?:/iu.test(resolved)) return unusable;
  return { url: resolved };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Reads a source and returns its text, or the reason it could not be read. Nothing here throws at the
// caller: a source that will not read is an ordinary outcome the caller records on the record and
// shows in the tab, and a thrown error would be indistinguishable from a bug in this module.
export async function readSource(line: string, roots: SourceRoots, options: Omit<ReadOptions, 'roots'> = {}): Promise<ReadResult> {
  const parsed = parseSource(line, roots);
  if ('error' in parsed) return parsed;
  const resolved: Required<ReadOptions> = {
    roots,
    fetchImpl: options.fetchImpl ?? ((url, init) => fetch(url, init)),
    maxBytes: options.maxBytes ?? MAX_BYTES,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
  };
  return parsed.kind === 'file' ? readFile(parsed, resolved) : readUrl(parsed.url, resolved);
}
