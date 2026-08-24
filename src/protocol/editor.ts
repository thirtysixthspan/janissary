// Editor-domain wire types and RPCs, composed into the shared contract by ../protocol.ts.

// One proposed edit from an in-editor persona-suggestion query (see editorSuggest below): the
// exact existing text to replace (empty means append at the end of the file) and its replacement
// (empty means delete the anchor text with nothing).
export type SuggestHunk = { anchor: string; replacement: string };

export type EditorRpcCall =
  // Write an editor tab's buffer back to disk. `url` is the tab's `/open/<id>` ref — the server
  // resolves it through the open-file allow-list, so only explicitly opened files are writable.
  | { method: 'saveFile'; params: { url: string; content: string } }
  // Sync an editor tab's in-progress (unsaved) buffer to the server as transient draft
  // state, debounced client-side after typing pauses. Never written to disk — see saveFile
  // for that. `url` identifies the tab the same way saveFile's does.
  | { method: 'editorSync'; params: { url: string; content: string } }
  // Manually re-pull a GitHub-synced editor tab's shared workspace from origin/master (the sync
  // status icon's click action). Fire-and-forget: the result surfaces via the tab's `sync` field
  // over the next `state` broadcast(s), the same as the save-triggered sync cycle. `url` identifies
  // the tab the same way saveFile's does.
  | { method: 'resyncEditorTab'; params: { url: string } }
  // List the persona names available to an editor tab's `>`-led suggestion requests, for
  // Tab-completion after `>` (see product/specs/editor-tab.md). Replies (deferred) with `{ names }`.
  | { method: 'editorPersonas'; params: Record<string, never> }
  // Fire a single-shot in-editor persona-suggestion query: prime the named persona with the
  // editor's live buffer content (including unsaved edits) and the request prompt, and reply
  // (deferred) with `{ hunks }` — the parsed edit hunks the persona proposed (empty when the
  // persona is unknown, the query fails, or it has nothing to suggest; a notification is posted
  // in each of those cases). `url` identifies the owning editor tab the same way saveFile's does.
  | { method: 'editorSuggest'; params: { url: string; persona: string; content: string; prompt: string } }
  // Close one of an editor tab's open persona ACP connections (the connections window's close
  // control). Fire-and-forget: the row disappears via the next `state` broadcast, so no reply
  // payload is needed. `url` identifies the owning editor tab the same way saveFile's does.
  | { method: 'closeEditorConnection'; params: { url: string; persona: string } };
