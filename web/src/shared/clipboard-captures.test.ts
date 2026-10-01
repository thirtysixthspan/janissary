import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The clipboard-history popup is only as good as the seam it reads from, and a copy site that writes
// to `navigator.clipboard` directly is invisible to it. Five sites were routed through `copyText` to
// get there, which is exactly the kind of change that decays: the next copy feature lands, writes
// where it is convenient, and nothing reports it.
//
// So this pins the invariant rather than each site. A per-site assertion cannot cover a site added
// later; this one can, and it fails with the path that broke it. Exactly one file may write to the
// clipboard without going through the seam — the seam's own writer.

const WRITER_ALLOWED_TO_BYPASS = 'web/src/shared/system-clipboard.ts';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

describe('clipboard writes', () => {
  it('all reach the one capture seam', () => {
    const bypasses = sourceFiles('web/src')
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) => readFileSync(file, 'utf8').includes('navigator.clipboard.writeText'))
      .filter((file) => file !== WRITER_ALLOWED_TO_BYPASS);

    expect(bypasses).toEqual([]);
  });

  it('publishes the one writer from the tab-plugin client API, which a plugin may import', () => {
    const source = readFileSync('web/src/plugins/api.ts', 'utf8');
    expect(source).toContain("export { copyText } from '../shared/system-clipboard'");
  });
});
