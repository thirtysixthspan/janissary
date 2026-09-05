import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Turning a path the app knows into the path a Seatbelt rule has to name. Split out of `index.ts`,
// which builds the profiles and the spawn commands; this answers the narrower question those
// builders keep asking, and answers it the same way for the harness profile and the browser one.

// Resolve a path through any symlinks (macOS's `/tmp` → `/private/tmp` being the common case) —
// Seatbelt's `subpath` rules match against the resolved path, so an unresolved path silently
// fails to carve in. Falls back to the input path if it doesn't exist (yet).
export function resolvePath(p: string): string {
  try { return realpathSync(p); } catch { return p; }
}

// One path in both the forms a Seatbelt carve-in needs — see `dualParams` in paths.ts for why a
// rule that names only one of them leaves the other operation denied.
export function dualPath(p: string): { literal: string; real: string } {
  return { literal: p, real: resolvePath(p) };
}

let cachedDarwinUserCacheDir: string | undefined;

// The real per-user `/var/folders/<xx>/<hash>/C/` cache directory macOS's `confstr(3)` hands out —
// NOT the same as `$TMPDIR`, which `sandboxSpawn` overrides to a workspace-local path, and NOT its
// `.../T/` (temp) sibling, which stays denied (that's where `os.tmpdir()`-based scratch dirs land —
// carving it in too would let a sandboxed process write anywhere a plain `mktemp` call resolves to,
// defeating the outside-the-workspace write deny). System frameworks look the cache path up directly
// via `confstr`, bypassing our `TMPDIR` override entirely, and write lock/cache files into it
// regardless (e.g. Security.framework's legacy MDS subsystem locks `.../C/mds/mds.lock` on every
// `SecItemCopyMatching` call — denied, the call silently fails rather than erroring, so a sandboxed
// harness reads back "not logged in" even with a valid Keychain item). Cached: it's fixed for the
// life of the host process.
export function darwinUserCacheDir(): string {
  if (cachedDarwinUserCacheDir) return cachedDarwinUserCacheDir;
  try {
    const cacheDir = execFileSync('getconf', ['DARWIN_USER_CACHE_DIR']).toString().trim();
    cachedDarwinUserCacheDir = resolvePath(cacheDir);
  } catch {
    cachedDarwinUserCacheDir = '/nonexistent-janissary-darwin-user-cache-dir-placeholder';
  }
  return cachedDarwinUserCacheDir;
}
