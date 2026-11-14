import { Minimatch } from 'minimatch';
import { isGlobPatternTooComplex, normalizeGlobPattern } from './pattern-limits.js';

export type GlobMatcher = (relative: string) => boolean;

const matchNothing: GlobMatcher = () => false;

// `path.matchesGlob` folds case on macOS and Windows with no way to turn it off, so this calls
// minimatch with Node's own option set except `nocase`, keeping matching case-sensitive everywhere.
// minimatch's typings have no `'posix'` platform; any non-`win32` value gives the same POSIX rules.
// `noext` also turns off extglob groups such as `+(a|b)`, which are undocumented and compile to
// nested quantifiers that backtrack catastrophically. minimatch receives the pattern already
// normalized, so the string it brace-expands is exactly the one the complexity cap judged.
export function createGlobMatcher(pattern: string, hidden: boolean): GlobMatcher {
  const normalized = normalizeGlobPattern(pattern);
  if (isGlobPatternTooComplex(normalized)) return matchNothing;
  let compiled: Minimatch;
  try {
    compiled = new Minimatch(normalized, {
      nocase: false,
      nonegate: true,
      noext: true,
      nocomment: true,
      windowsPathsNoEscape: true,
      optimizationLevel: 2,
      platform: 'linux',
      dot: hidden,
    });
  } catch {
    return matchNothing;
  }
  return (relative) => compiled.match(relative);
}
