import { git } from './git.js';
import { parseDiff } from './parse-diff.js';
import type { DiffFile } from './shared.js';

async function contextFile(root: string, file: DiffFile, prefix: string, lines: number): Promise<DiffFile | undefined> {
  const paths = file.oldPath === undefined ? [file.path] : [file.path, file.oldPath];
  const output = await git(root, [
    '--literal-pathspecs', 'diff', 'HEAD', '-M', '--no-ext-diff', '--no-color', `--unified=${lines}`, '--', ...paths,
  ]);
  return parseDiff(output, { prefix }).find((candidate) => candidate.path === file.path);
}

export async function expandContextFiles(
  root: string, files: DiffFile[], prefix: string, contexts: ReadonlyMap<string, number>,
): Promise<DiffFile[]> {
  const expanded: DiffFile[] = [];
  for (const file of files) {
    const lines = contexts.get(file.path);
    if (lines === undefined || file.binary || file.hunks.length === 0) {
      expanded.push(file);
      continue;
    }
    try {
      const current = await contextFile(root, file, prefix, lines);
      const next = await contextFile(root, file, prefix, lines + 1);
      expanded.push({
        ...(current ?? file), contextLines: lines,
        canExpandContext: lines < 1_000_000 && JSON.stringify(current?.hunks) !== JSON.stringify(next?.hunks),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message.split('\n', 1)[0] : String(error);
      expanded.push({
        ...file, contextLines: lines, canExpandContext: true,
        contextError: reason || 'Context expansion failed',
      });
    }
  }
  return expanded;
}
