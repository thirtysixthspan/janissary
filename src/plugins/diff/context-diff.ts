import { git } from './git.js';
import { parseDiff } from './parse-diff.js';
import type { DiffFile } from './shared.js';

async function fullFile(root: string, file: DiffFile, prefix: string, signal?: AbortSignal): Promise<DiffFile | undefined> {
  const paths = file.oldPath === undefined ? [file.path] : [file.path, file.oldPath];
  const output = await git(root, [
    '--literal-pathspecs', 'diff', 'HEAD', '-M', '--no-ext-diff', '--no-color', '--unified=1000000', '--', ...paths,
  ], signal);
  return parseDiff(output, { prefix }).find((candidate) => candidate.path === file.path);
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n').find((line) => line.trim() !== '') ?? 'Context expansion failed';
}

export async function expandFullFileContext(
  root: string,
  files: DiffFile[],
  prefix: string,
  expanded: ReadonlySet<string>,
  signal?: AbortSignal,
): Promise<DiffFile[]> {
  const result: DiffFile[] = [];
  for (const file of files) {
    if (signal?.aborted) throw signal.reason ?? new Error('Git diff read aborted');
    if (!expanded.has(file.path) || file.binary || file.added || file.deleted || file.hunks.length === 0) {
      result.push(file);
      continue;
    }
    try {
      result.push({ ...(await fullFile(root, file, prefix, signal) ?? file), contextLines: 1_000_000 });
    } catch (error) {
      if (signal?.aborted) throw error;
      result.push({ ...file, contextLines: 1_000_000, contextError: reasonOf(error) });
    }
  }
  return result;
}
