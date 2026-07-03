# Edit command: open new text files

**Complexity: 3/10** — remove one existence check, update one server response path; one server file, one client file touched, no new modules.

## Goal

The `edit <file>` command can open a path that does not yet exist on disk. The editor opens with an empty buffer and the file is only written to disk when the user explicitly saves (Cmd+S). Currently, `edit` requires the file to exist on disk — attempting to edit a new file prints `edit: <file>: no such file` and aborts.

## Background

`OpenFileManager.edit()` in `src/open-file-manager.ts:48` calls `existsSync(file)` and returns early if the file is missing. The editor opener itself (`openInEditor` in `src/openers/editor.ts`) already handles missing files gracefully — it sets `size: 'unknown'`, registers the path in the allow-list, and opens an editor tab. The only blocker is the existence check in the `edit` command handler.

When the web client mounts an editor tab, it fetches the file content from the `/open/<id>` serve route. For a non-existent file, `readFile` throws and the server returns 404. The web client catches this and shows `"Failed to load <name>"` as an error. To give a clean empty-buffer experience, the server should return an empty body when the registered file does not exist on disk yet.

## Approach

1. Remove the `existsSync` guard in `OpenFileManager.edit()` so new-file paths pass through to `openInEditor`.
2. Update the `/open/<id>` serve route in `src/index.ts` to return empty content instead of 404 when the registered path does not exist on disk.

## Implementation steps

1. **Remove existence check** — delete the `existsSync` guard in `src/open-file-manager.ts:48` so the `edit` command forwards any path (existing or not) to `openInEditor`.
2. **Serve empty content for missing registered files** — in `src/index.ts`, after `readFile` fails, return `200` with an empty body instead of `404`. The file is already confirmed to be in the allow-list (the `openFilePath` lookup succeeded), so this is safe.
3. **Run `./scripts/run.mjs check-diff`** after each change.

## Testing

- `src/openers/editor.test.ts` — already tests that `openInEditor` handles missing files (`size: 'unknown'`). No new test needed for the opener.
- `web/src/EditorTab.test.tsx` — add a test that a 404 response on load results in an empty buffer (no load error shown), verifying the server returns empty content for a new file. Or, if the server change is verified server-side, add a test in a server test file.
- Verify that `src/open-file-manager.ts` behavior change works: the `edit()` method no longer blocks on non-existent files. Since the `OpenFileManager` depends on `existsSync` from `node:fs`, mocking it in tests may require `vi.mock`. The key test: calling `edit` with a non-existent path should call `openInEditor` (previously it would append an error and return).

## Out of scope

- The `open` command's existence check (`openOne` at line 65) — `open` still requires existing files because it dispatches through the opener registry which needs real file metadata for correct routing. The issue only concerns `edit`.
- Auto-save behavior — the editor already only saves on Cmd+S; no change needed.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: run `edit /tmp/newfile.txt` — the editor opens with an empty buffer and no error. Type content and press Cmd+S — the file is written to `/tmp/newfile.txt`. Verify the file exists on disk with the typed content.
