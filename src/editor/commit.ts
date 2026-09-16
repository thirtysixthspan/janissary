import path from 'node:path';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { EditorView } from '../tab/types.js';
import { commitLeftStagingInPlace, commitRoot } from '../git/commit.js';
import { remoteFileFor } from '../file-navigator/remote-file-cache.js';
import { notify } from '../notifications.js';

const REST_HOLD_MS = 3000;

const commitSuccessText = (summary: string) => summary ? `Committed to origin: ${summary}` : 'Committed to origin';
const commitFailureText = (error: string) => `Could not commit: ${error}`;
const commitFailureLeavesStagedText = (error: string) =>
  `Could not commit: ${error} — what was staged is still in your index`;
const NOTHING_TO_COMMIT_TEXT = 'Nothing to commit';

// The editor metadata row's commit-to-origin icon, the navigator commit button applied to this
// one file: stage the file, commit, rebase onto `origin`, and push — the current branch's own
// name — all through the same `commitRoot` cycle the navigator runs. The message is the
// navigator's generated single-file default; the outcome is reported the same way, as one
// notifications line, with the icon cycling committing → committed/error → rest.
export function commitEditorFile(managers: Managers, url: string, message: string): void {
  const tab = managers.tab.editorTabByUrl(url);
  const editor = tab?.editor;
  if (!tab || !editor) return;
  if (editor.commit === 'committing') return;
  if (remoteFileFor(editor.path)) {
    notify(managers, 'file-operation', tab.label, 'Could not commit: remote files commit from their navigator');
    return;
  }
  const settled = (state: 'committed' | 'error' | undefined) => {
    const current = managers.tab.editorTabByUrl(url);
    if (!current?.editor) return;
    current.editor = { ...current.editor, commit: state };
    messageBus.emit('state', { type: 'dirty' });
    setTimeout(() => {
      const later: EditorView | undefined = managers.tab.editorTabByUrl(url)?.editor;
      if (later && later.commit === state) {
        tab.editor = { ...later, commit: undefined };
        messageBus.emit('state', { type: 'dirty' });
      }
    }, REST_HOLD_MS);
  };
  tab.editor = { ...tab.editor, commit: 'committing' };
  messageBus.emit('state', { type: 'dirty' });
  void (async () => {
    try {
      const result = await commitRoot(path.dirname(editor.path), message, [editor.path]);
      if (!result.committed) {
        notify(managers, 'file-operation', tab.label, NOTHING_TO_COMMIT_TEXT);
        settled(undefined);
        return;
      }
      notify(managers, 'file-operation', tab.label, commitSuccessText(result.summary));
      settled('committed');
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      notify(
        managers, 'file-operation', tab.label,
        commitLeftStagingInPlace(error) ? commitFailureLeavesStagedText(errorText) : commitFailureText(errorText),
      );
      settled('error');
    }
  })();
}
