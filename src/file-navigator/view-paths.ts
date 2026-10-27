import path from 'node:path';

export function toTreePath(input: string, root: string, expand: (input: string) => string): string | undefined {
  if (input === '..') return '..';
  const isAbsolute = path.posix.isAbsolute(input)
    || input === '~' || input.startsWith('~/')
    || input === '$root' || input.startsWith('$root/');
  if (!isAbsolute) {
    const normalized = path.posix.normalize(input).replace(/\/$/, '');
    if (normalized === '..' || normalized.startsWith('../')) return undefined;
    return normalized === '.' ? '' : normalized;
  }

  const target = path.posix.normalize(expand(input));
  const relative = path.posix.relative(path.posix.resolve(root), target);
  if (relative === '') return '';
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) return undefined;
  return path.posix.normalize(relative);
}
