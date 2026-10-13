import { statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { humanSize } from '../openers/size.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { nextFreeName } from './next-free-name.js';
import { atomicWriteFile } from '../atomic-write.js';
import { isRemoteCacheFile, remoteFileFor } from '../file-navigator/remote/file-cache.js';
import { notify } from '../notifications/index.js';
import type { MaybePromise } from '../maybe-promise.js';
import { errorFirstLine, errorText } from '../error-text.js';
import { writeGitFailureOutput } from '../git/failure-output.js';
import { refuseStaleSave } from './stale-save.js';
import { refreshSyncedTabs } from './refresh-synced.js';
import { beginEditorSync, currentEditorForSync, type EditorSyncToken } from './sync-status.js';

// Write an editor tab's buffer back to disk. `url` is the tab's `/open/<id>` ref, resolved
// through the open-file allow-list — the client can only ever write to files the user explicitly
// opened. Throws on an unknown ref or a write failure; the RPC layer turns that into an error
// reply for the client's save feedback. `expectedHash`, when given, is the fingerprint of the
// content the buffer last matched, and the write is refused if the file on disk no longer has it
// (see `refuseStaleSave`); the overwrite prompt's own write omits it to replace the file anyway.
export function saveFile(managers: Managers, url: string, content: string, expectedHash?: string): MaybePromise<void> {
  const id = url.startsWith('/open/') ? url.slice('/open/'.length) : '';
  const filePath = id ? managers.tab.openFilePath(id) : undefined;
  if (!filePath) throw new Error(`saveFile: unknown file ref "${url}"`);
  const tab = managers.tab.editorTabByUrl(url);
  const wasNewFile = !!tab?.editor?.newFile;

  // A new-file editor's first save silently auto-suffixes instead of overwriting a same-named
  // file that another untitled tab already saved. Only the first save is eligible — `newFile`
  // clears below once the write lands, so later saves on this tab overwrite normally.
  const remote = remoteFileFor(filePath);
  if (!remote && isRemoteCacheFile(filePath)) refuseOrphanedRemoteSave(managers, tab?.label);
  const isFirstNewFileSave = wasNewFile && existsSync(filePath) && !remote;
  const targetPath = isFirstNewFileSave ? path.join(path.dirname(filePath), nextFreeName(path.dirname(filePath), path.basename(filePath))) : filePath;

  if (!remote && managers.shellTranscript.isWriting(filePath)) refuseLiveShellTranscriptSave(managers, tab?.label);
  if (expectedHash !== undefined && !wasNewFile && !remote) refuseStaleSave(managers, tab?.label, filePath, expectedHash);
  // A remote file's cached copy is written only once the remote has the content, so a write the
  // remote refuses — or never answers — leaves the two copies agreeing rather than diverged.
  if (remote) return saveRemote(managers, remote, content, wasNewFile ? undefined : expectedHash, () => {
    atomicWriteFile(targetPath, content);
    finishSave(managers, url, targetPath, filePath, wasNewFile);
  });
  atomicWriteFile(targetPath, content);
  finishSave(managers, url, targetPath, filePath, wasNewFile);
}

export const ORPHANED_REMOTE_SAVE_REASON =
  'Could not save remote file: its file navigator is closed. Reopen the file from the remote navigator to save it.';

// A cached copy of a remote file whose navigator has closed has no route back to the remote. Saving
// it only locally would leave the remote file unchanged while the editor reports it saved.
function refuseOrphanedRemoteSave(managers: Managers, label: string | undefined): never {
  if (label) notify(managers, 'file-operation', label, ORPHANED_REMOTE_SAVE_REASON);
  throw new Error(ORPHANED_REMOTE_SAVE_REASON);
}

export const LIVE_SHELL_TRANSCRIPT_SAVE_REASON =
  'This shell transcript is still being written; copy it to another file to edit it.';

// A shell transcript's writer appends through a stream it opened once, so replacing the file would
// leave every later row in the orphaned file. Refused whether or not the buffer is stale, so the
// overwrite prompt's own write is refused too.
function refuseLiveShellTranscriptSave(managers: Managers, label: string | undefined): never {
  if (label) notify(managers, 'file-operation', label, LIVE_SHELL_TRANSCRIPT_SAVE_REASON);
  throw new Error(LIVE_SHELL_TRANSCRIPT_SAVE_REASON);
}

function finishSave(
  managers: Managers, url: string, targetPath: string, filePath: string, wasNewFile: boolean,
): void {
  const tab = managers.tab.editorTabByUrl(url);
  // Refresh the owning tab's displayed size from the file's new on-disk size.
  const stat = statSync(targetPath);
  if (tab?.editor) {
    if (targetPath === filePath) {
      tab.editor = { ...tab.editor, size: humanSize(stat.size), newFile: false };
    } else {
      const name = path.basename(targetPath);
      tab.editor = {
        ...tab.editor, path: targetPath, name,
        url: managers.tab.replaceFile(tab.editor.url, targetPath), size: humanSize(stat.size), newFile: false,
      };
      tab.title = name;
    }
  }
  // The content is now canonical on disk, so any transient draft is superseded — drop it.
  if (tab) tab.editorDraft = undefined;
  if (tab && wasNewFile) {
    // The file didn't exist when the tab opened, so no watcher was ever established for it —
    // start one now that it's on disk, rather than moving a baseline that was never set.
    managers.editorWatch.watch(tab.label, targetPath);
  } else if (tab) {
    // Re-arm observation of the replaced file with its saved baseline, so the save itself isn't
    // mistaken for an external change and later edits still reach the editor.
    managers.editorWatch.markSaved(tab.label, stat.mtimeMs);
  }
  // The write and "Saved" flash above are synchronous and complete either way; a synced file's
  // git-sync cycle (commit/pull-rebase/push) only starts after, and is never awaited here, so a
  // slow or failing network sync never delays the save confirmation the user already saw.
  if (tab?.editor?.sync) {
    tab.editor = { ...tab.editor, sync: 'syncing' };
    void syncAfterSave(managers, beginEditorSync(tab), tab.editor.path);
  }
  messageBus.emit('state', { type: 'dirty' });
}

async function saveRemote(
  managers: Managers,
  remote: NonNullable<ReturnType<typeof remoteFileFor>>,
  content: string,
  expectedHash: string | undefined,
  finish: () => void,
): Promise<void> {
  try {
    const result = expectedHash === undefined
      ? await remote.filesystem.writeFile(remote.root, remote.relPath, Buffer.from(content))
      : await remote.filesystem.writeFile(remote.root, remote.relPath, Buffer.from(content), expectedHash);
    if (!result.ok) throw new Error(result.reason);
  } catch (error) {
    const reason = errorText(error);
    notify(managers, 'file-operation', remote.label, `Could not save remote file: ${reason}`);
    throw error;
  }
  finish();
}

// The cycle's pull may have rewritten this or any other synced file, so every synced tab is
// re-checked once it settles, whichever way it went. A failure is also a notification, which the
// sync icon's error tooltip points the user to.
async function syncAfterSave(managers: Managers, token: EditorSyncToken, filePath: string): Promise<void> {
  const result = await managers.gitSync.saveSync(filePath);
  refreshSyncedTabs(managers);
  const tab = currentEditorForSync(managers, token);
  if (!tab) return;
  if ('error' in result) {
    notify(managers, 'file-operation', tab.label, `Could not sync ${path.basename(filePath)}: ${errorFirstLine(result.error)}`, {
      openFile: writeGitFailureOutput(tab.label, Date.now(), result.error),
    });
  }
  tab.editor = { ...tab.editor, sync: 'error' in result ? 'error' : 'synced' };
  messageBus.emit('state', { type: 'dirty' });
}
