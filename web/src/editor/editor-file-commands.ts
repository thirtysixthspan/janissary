import type { JanusClient } from '../ws';

// The metadata row's commit-to-origin icon: the save lands first (its failure is already on
// screen as the row's error), then the commit/push cycle arms server-side on the same file.
export async function commitAfterSave(
  client: Pick<JanusClient, 'commitEditorFile'>,
  save: () => Promise<void>,
  url: string,
  name: string,
): Promise<void> {
  try {
    await save();
    client.commitEditorFile(url, `sync: ${name}`);
  } catch {
    // The failed save is already on screen, so there is nothing to commit and nothing to report.
  }
}

// The metadata row's rename input: committing an accepted name follows the same editor-tab rename
// semantics as renaming the tab label, so the tab label and path move together via the next
// state broadcast. The caret then returns to the editor buffer.
export function renameAndRefocus(
  client: Pick<JanusClient, 'renameEditorFile'>,
  url: string,
  next: string,
  focusBuffer: () => void,
): void {
  client.renameEditorFile(url, next);
  focusBuffer();
}

export function sendResync(client: Pick<JanusClient, 'send'>, url: string): void {
  client.send({ method: 'resyncEditorTab', params: { url } });
}
