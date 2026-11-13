import { Minimatch } from 'minimatch';

export type GlobMatcher = (relative: string) => boolean;

const matchNothing: GlobMatcher = () => false;

// `path.matchesGlob` folds case on macOS and Windows with no way to turn it off, so this calls
// minimatch with Node's own option set except `nocase`, keeping matching case-sensitive everywhere.
// minimatch's typings have no `'posix'` platform; any non-`win32` value gives the same POSIX rules.
export function createGlobMatcher(pattern: string, hidden: boolean): GlobMatcher {
  let compiled: Minimatch;
  try {
    compiled = new Minimatch(pattern, {
      nocase: false,
      nonegate: true,
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
