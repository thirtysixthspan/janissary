import { randomUUID } from 'node:crypto';
import { renameSync, rmSync, statSync, writeFileSync } from 'node:fs';

function existingMode(file: string): number | undefined {
  try { return statSync(file).mode & 0o777; } catch { return undefined; }
}

export function atomicWriteFile(file: string, content: string): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const options: { encoding: 'utf8'; mode?: number } = { encoding: 'utf8' };
    const mode = existingMode(file);
    if (mode !== undefined) options.mode = mode;
    writeFileSync(temporary, content, options);
    renameSync(temporary, file);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* best-effort cleanup */ }
    throw error;
  }
}
