import path from 'node:path';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { errorText } from '../error-text.js';
import { remoteFileFor, retargetRemoteFileRecord } from '../file-navigator/remote/file-cache.js';

// A cached remote file renamed in its editor keeps writing back to the remote: its record follows
// the new name, and the remote file is renamed to match. The request is sent before the rename
// returns, so a save made right after it reaches the remote after the rename.
export function retargetRemoteFile(managers: Managers, oldPath: string, newPath: string): void {
  const previous = remoteFileFor(oldPath);
  if (!previous) return;
  const name = path.basename(newPath);
  retargetRemoteFileRecord(oldPath, newPath);
  const report = (reason: string): void => {
    notify(managers, 'file-operation', previous.label, `Could not rename remote file ${previous.relPath} to ${name}: ${reason}`);
  };
  void (async () => {
    try {
      const result = await previous.filesystem.rename(previous.root, previous.relPath, name);
      if ('conflict' in result) report('a file with that name already exists');
      else if (!result.ok) report(result.reason);
    } catch (error) {
      report(errorText(error));
    }
  })();
}
