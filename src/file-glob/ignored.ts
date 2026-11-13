import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function normalize(entry: string): string {
  return entry.endsWith('/') ? entry.slice(0, -1) : entry;
}

export async function loadIgnoredPaths(root: string): Promise<ReadonlySet<string>> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
      { cwd: root, maxBuffer: 1024 * 1024 * 64 },
    );
    const entries = stdout.split('\0').filter(Boolean).map((entry) => normalize(entry));
    return new Set(entries.filter((entry) => entry !== '.'));
  } catch {
    return new Set();
  }
}
