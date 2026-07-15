// A minimal POSIX-style equivalent of Node's `path.relative`, since the browser bundle has no
// dependency on Node's `path` module anywhere in web/src. Both `base` and `target` are absolute,
// `/`-separated paths.
export function relativePath(base: string, target: string): string {
  const baseSegments = base.split('/').filter(Boolean);
  const targetSegments = target.split('/').filter(Boolean);
  let common = 0;
  while (
    common < baseSegments.length && common < targetSegments.length
    && baseSegments[common] === targetSegments[common]
  ) {
    common += 1;
  }
  const up = baseSegments.slice(common).map(() => '..');
  const down = targetSegments.slice(common);
  return [...up, ...down].join('/');
}
