import { globSync, statSync } from 'node:fs';
import path from 'node:path';

// Expand an `open` glob to the files it names, matched by this process rather than by whatever login
// shell the user happens to run.
//
// This used to build a bash-shaped `for f in <pattern>; do …; done` string and run it through
// `SHELL_NAME`. Two things followed. On a host whose login shell is fish or csh that loop is a syntax
// error, the empty output read as an empty match set, and `open *.png` reported no matching files for
// a directory full of them. And because the pattern was interpolated into a shell command raw, one
// carrying a `;` ran whatever followed it.
//
// `globSync` covers exactly the metacharacters `isGlobPattern` advertises — `*`, `?`, `[…]`, and
// `{…}` brace expansion — and behaves the same on every host. A pattern containing shell punctuation
// matches nothing, because nothing here interprets it as a command.
//
// The contract `runOpenCommand` depends on is unchanged: absolute paths resolved against `cwd`,
// non-files dropped (so a pattern matching only directories yields nothing), duplicates removed, and
// `localeCompare` ordering. The `OPEN_MAX_FILES` cap stays with the caller.
export function expandGlob(pattern: string, cwd: string): string[] {
  let matches: string[];
  try {
    matches = globSync(pattern, { cwd });
  } catch {
    return [];
  }
  const files = matches
    .map((match) => (path.isAbsolute(match) ? match : path.resolve(cwd, match)))
    .filter((file) => { try { return statSync(file).isFile(); } catch { return false; } });
  return [...new Set(files)].toSorted((a, b) => a.localeCompare(b));
}
