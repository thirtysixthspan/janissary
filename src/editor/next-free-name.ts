import { existsSync } from 'node:fs';
import path from 'node:path';

// The next free filename in `dir`, starting from `name` verbatim. If `name` is already taken,
// tries `<base>-2<ext>`, `<base>-3<ext>`, and so on until one doesn't exist. Pure filesystem
// check — the caller owns the create-time race between checking and writing.
export function nextFreeName(dir: string, name: string): string {
  if (!existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}${ext}`;
    if (!existsSync(path.join(dir, candidate))) return candidate;
  }
}
