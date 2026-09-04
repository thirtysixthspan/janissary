# A new file's editor tab opens on an empty buffer instead of a load failure

**Complexity: 2/10** — one guard in the editor's load effect, mirroring the guard already sitting one line above it; one client file touched, no new modules.

Creating a file from the file navigator — the header's **New file** button, `Cmd+N`, or the row context menu's **New file** entry — opens an editor tab that immediately reports `Failed to load untitled.md` in its metadata row, beside the name, the size `unknown`, and the resolved path. There is no buffer behind the error: the gutter is empty, no caret renders, the textarea never takes focus, and nothing can be typed. The one thing New file exists to do cannot be done.

## Reproduction

The failure is two halves that meet at the `/open/<id>` reference, and both were observed directly.

**Server** — a throwaway script drove `OpenFileManager.newFile` for a path that does not exist and then served its registered reference through `serveOpenFile`:

```
editor view opened by `newfile`: {"name":"untitled.md","path":"…/untitled.md","size":"unknown","url":"/open/1","newFile":true}
GET /open/1 -> 404 ""
```

**Client** — an editor tab rendered on exactly that view (`size: 'unknown'`, `newFile: true`) with a 404 answering its fetch produced the reported metadata row verbatim, and an editor body holding nothing but the hidden textarea:

```
<span class="editor-name">untitled.md</span>
<span class="editor-size">unknown</span>
<span class="editor-loc">/repo/untitled.md</span>
<span class="editor-error">Failed to load untitled.md</span>
```

## Root cause

`useEditorFile` fetches the file's content on mount for every editor tab. A new file has no content to fetch: `newfile` resolves a name that is deliberately *not* taken (`nextFreeName`), so nothing is written to disk until the first save, and the registered reference points at a path that is not there.

The route answers that correctly. `serveOpenFile` returns 404 when a registered file cannot be statted — a deliberate change (`fix(open): report resource read failures`, #841) so that a file deleted out from under an open tab surfaces as a failure rather than as a successful empty document. Before it, a missing file answered `200` with an empty body, and a new file's editor got its empty buffer as a side effect of that leniency. Restoring the leniency would undo #841 and is not the fix.

The client is where the knowledge lives instead. The view already carries `newFile`, set by `openInEditor` exactly when the `stat` at open time failed, and the load effect ignores it — so it fetches a file it has been told does not exist and reports the expected 404 as a real resource failure.

## Correct behavior

`product/specs/editor-tab.md` → "New files" is authoritative and already states it: the editor opens with an **empty buffer**, showing the file's name, a size of `unknown`, and the resolved path; the file is not written to disk until the user explicitly saves. No load error. The buffer is editable and focused, and starts clean — the save button lights up only once something is typed.

## Approach

**Do not fetch a file the tab already knows is not there.** The effect opens with the same shape of guard one line up:

```ts
if (editor.sync === 'provisioning') return;
```

— a synced tab skips the read because its file does not exist *yet*. A new-file tab is the same case for a different reason, and gets the same treatment: load the empty buffer the first save will write, mark it as the last-saved text so the tab starts clean, and return without a request.

**Not "treat a 404 as empty".** That would put the decision after the fetch, where a new file and a file deleted mid-session look identical — and telling them apart is exactly what #841 established. The guard runs before the request, on the flag the server already computed, so a genuine load failure keeps reporting itself.

**The flag is trustworthy.** It is set in two places only: `openInEditor`, from a `stat` performed as the tab opens, and `createNavigatorFile`, on a remote file just materialized with empty content — whose empty buffer is also correct. `save.ts` clears it on the first save. It is never persisted across a relaunch; a restored tab re-`stat`s. So there is no path where `newFile` is set and real content exists on disk to be skipped over.

## Implementation steps

1. `web/src/editor/useEditorFile.ts` — in the load effect, after the `provisioning` guard, load an empty buffer and set it as the last-saved text for a `newFile` view, then return without fetching. Comment it with why the reference would 404, as the guard above it is commented.

## Regression test

- `web/src/editor/EditorTab.test.tsx` — a `newFile` view whose fetch answers 404 renders a one-line editable buffer, shows no `.editor-error`, and never issues the fetch. This is the test written first, watched failing against the buggy code with `Failed to load untitled.md` in the metadata row.
- `web/src/editor/useEditorFile.test.ts` — the hook loads `''` for a `newFile` view, leaves `loadError` null, does not call `readFile`, and reports the buffer clean until it is edited.

The existing "shows a load error when the fetch fails" case stays untouched and passing: it uses a view without `newFile`, which is what a deleted-mid-session file is.

## Specs

- `product/specs/editor-tab.md` → "New files" — the empty buffer is opened without reading anything, so a path that does not exist yet never reports a load failure.
- `product/specs/open.md` — the resource-failure paragraph gains the carve-out: it governs views that fetch, and a not-yet-created file's editor does not.

## Documentation

None needed. `documentation/user-documentation/tab-types/editor.md` already describes the correct behavior ("the file shows a size of 'unknown' and isn't created until your first save"); the fix makes the app match what is written rather than changing it.

## Out of scope

- **The 404 from `serveOpenFile`.** Correct, and deliberately so (#841).
- **Recovering an editor tab whose file is deleted after it opens.** Still reports a load failure, which is the point of #841 and was already out of scope there.
- **The `newfile` command, `nextFreeName`, and the navigator's target-directory rules.** All behaved correctly in the reproduction.
- **Whether an untouched new-file tab can be saved.** Cmd+S on an empty new buffer still writes the empty file; the save button's dirty gating is unchanged.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: in a file navigator, click **New file** (or press `Cmd+N`, or use the row context menu's **New file**). The editor tab opens named `untitled.md`, size `unknown`, with an empty editable buffer and no error in the metadata row. Type, press `Cmd+S`, and the file appears on disk with what was typed.
