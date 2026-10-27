import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

export function regularHelpPagePath(directory: string, file: string): string | undefined {
  try {
    const resolvedDirectory = realpathSync(directory);
    const candidate = path.join(resolvedDirectory, file);
    if (!lstatSync(candidate).isFile()) return undefined;

    const resolvedFile = realpathSync(candidate);
    const relativePath = path.relative(resolvedDirectory, resolvedFile);
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      return undefined;
    }

    return resolvedFile;
  } catch {
    return undefined;
  }
}
