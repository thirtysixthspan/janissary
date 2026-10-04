import { isInsideRoot } from '../plugins/files.js';

// The boundary a plugin-declared terminal may not cross. `isInsideRoot` is the same helper `openInEditor`
// already measures a plugin's path against, and `launchDir` the same field, so the two file-shaped
// resources and this one refuse a directory outside the project root by one rule rather than three.
//
// It throws rather than returning false: the caller is a payload factory whose only way to report a
// problem is to fail, and a resource that silently started nothing would leave the plugin with a
// terminal id it never received. `withResources` turns the throw into no tab, which is the outcome.
export function assertTerminalCwd(launchDir: string, cwd: string): void {
  if (!isInsideRoot(launchDir, cwd)) {
    throw new Error(`refused to start a terminal in ${cwd}: outside the project root ${launchDir}`);
  }
}