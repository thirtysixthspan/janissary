# Hosted write tool 2a — mutation contract types and one-line messages

**Complexity: 4/10** — ~65 added lines in two new pure modules, 8 requirements, 10 formatting scenarios (p=4.99).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Decomposed from subplan 2 (`./product/plans/complete/janissary-hosted-agent-write-tool-2-mutation-parser.md`); this is piece 2a of 3 (2a, 2b, then 2c), run order 2 of 15 in the hosted write tool series. It depends on no earlier piece of code: it runs after plan 1 (`./product/plans/complete/janissary-hosted-agent-write-tool-1-shared-file-policy.md`, landed) only by series order and imports nothing from it. Plan 2c and plans 5, 6, 7, 9, 10, and 11 import what this piece exports, so the export names below are fixed.

The write and edit commands share a small contract (request shapes, the edit result value, the two match-failure reasons, and a policy selector) and a set of one-line outcome messages. This piece adds both as pure modules so the parser (plan 2c) and the later filesystem helpers and executors depend on a contract module rather than on each other. Nothing here touches the filesystem, and nothing calls it yet; no existing file changes.

## Goal

`src/file-write/types.ts` holds the shared mutation contract, and `src/file-write/messages.ts` turns a typed path and an outcome into the exact single line the later executors print, with the path escaped so the line can never break.

## Design decisions and dependencies

- Source plan decision: the shared port contract types go in `src/file-write/types.ts`. The one-line output formatters and the path display helper go in `src/file-write/messages.ts` from the start (not as an overflow fallback), so the `command.ts` that plans 2b and 2c build stays well under the 200-line limit and plan 11 extends `messages.ts` with its own failure mapping. Both modules are pure (architecture principle 4): they return values and perform no I/O. `messages.ts` imports from `./types.js` only; `types.ts` imports nothing from `src/file-navigator/` or any port implementation. All relative imports carry `.js`.
- Types in `types.ts`, with these exported names: `FileWritePolicy` (the literal `'tool-text'`, named `policy` where it travels); `FileWriteRequest` (`kind: 'write'`, `path`, `content`, optional `expectedHash`); `FileEditRequest` (`kind: 'edit'`, `path`, `oldString`, `newString`, `replaceAll` always present as a boolean after defaulting); `FileMutationRequest`, the union of the two discriminated by `kind`; `FileEditValue`, the edit success value `{ replacements }` (a positive integer), used as `FileOperationResult<FileEditValue>` by plans 6, 9, and 10; and the two edit match-failure reason constants `NO_MATCHING_TEXT_REASON` (`'No matching text'`) and `MULTIPLE_MATCHES_REASON` (`'Multiple matches'`), which plan 6's helper returns as `{ ok: false, reason }` and which cross the remote protocol as plain strings. The reason words live in `types.ts`, not `command.ts`, so the filesystem helpers depend on the contract module rather than the parser. `FileEditValue` is a plain object type; `types.ts` does not import `FileOperationResult` (consumers combine them).
- Field names and kinds come from the backlog: write carries `path`, `content`, and optional `expectedHash`; edit carries `path`, `oldString`, `newString`, and `replaceAll`. All are strings except `replaceAll`, a boolean. Validation of those fields is plan 2c's job; the types here describe the already-validated request.
- `messages.ts` exports four functions, each taking the path as the caller typed it and escaping it itself so no caller can forget: `displayPath(path)`; `writeSuccessLine(path)` → `Wrote <path>.`; `editSuccessLine(path, replacements)` → `Edited <path> (<count> replacements).` with the actual count and the literal word `replacements` even for 1, as the source plan specifies; `matchFailureLine(reason, path)` → `No matching text: <path>.` for `NO_MATCHING_TEXT_REASON`, `Multiple matches: <path>; set replaceAll to true.` for `MULTIPLE_MATCHES_REASON`, and `undefined` for any other reason so plan 11 falls through to its own mapping. No formatter takes or prints file content.
- `displayPath` escaping: a single forward scan over code points, not a regex (a regex with literal control characters trips `no-control-regex` from `js.configs.recommended`). Iterate the string with `for…of` and read each character with `codePointAt(0)` (satisfies `unicorn/no-for-loop` and `unicorn/prefer-code-point` from `unicorn.configs['flat/recommended']`); the range test mirrors `isRemovedControl` in `web/src/plugins/shell/strip-terminal-controls.ts` (C0 below 0x20, then 0x7F–0x9F), but write a local helper in `messages.ts` — server code must not import from `web/src/`. Render `\n`, `\r`, and `\t` as those two-character escapes (write the literals with `String.raw`, as `src/plugins/diff/activate.ts` does for `\<`, to satisfy `unicorn/prefer-string-raw`); render every other code point in U+0000–U+001F, U+007F–U+009F, U+2028, and U+2029 as `\u` plus four lowercase hex digits (`toString(16)` padded to 4 with `0`), so ESC is `\u001b`; leave everything else, including backslash, non-BMP characters, and lone surrogates, unchanged. The result never contains a line break. An empty path returns an empty string (the parser rejects empty paths before any formatter runs, so no special case is added).
- `editSuccessLine` prints `replacements` with plain `String` conversion and does not validate it; the positive-integer guarantee belongs to plans 6 and 9, which produce and decode the value.
- Plan 2c's parser uses `displayPath` for its `File too large (>5 MB): <path>.` error, which is why this piece lands first.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-navigator/file-operation-result.ts` `FileOperationResult` | The `{ ok, value } / { ok, reason }` shape `FileEditValue` and the match-failure reasons plug into |
| `src/file-read/tab-read.ts` `asTyped` | Precedent for answering with the path as typed; the formatters here take the typed path directly |
| `web/src/plugins/shell/strip-terminal-controls.ts` `isRemovedControl` | Precedent for the C0/DEL/C1 range test done by code point instead of a control-character regex (copy the idea, do not import across `web/src/`) |
| `src/plugins/diff/activate.ts` `String.raw` escapes | Precedent for writing backslash literals under `unicorn/prefer-string-raw` |
| `src/file-read/format.test.ts` | Test file shape to mirror (vitest `describe`/`it`/`expect`, `.js` imports) |

## Proposed changes

1. Create `src/file-write/types.ts` with the types and the two reason constants above.
2. Create `src/file-write/messages.ts` with `displayPath` and the three line formatters, importing the reason constants from `./types.js`.

Steps land in this order in one change; `messages.ts` only imports `types.ts`.

## Tests

Add `src/file-write/messages.test.ts`:

- Exact success lines, including `Wrote a.md.`, `Edited a.md (1 replacements).`, and `Edited a.md (3 replacements).`; both match-failure lines, built from the exported constants (not retyped strings), so a changed constant fails the test; `undefined` for an unrelated reason such as `OUTSIDE_ROOT_REASON`; a path containing `\n`, `\r`, a tab, ESC, DEL, U+0085, and U+2028 renders on one line as `\n`, `\r`, `\t`, `\u001b`, `\u007f`, `\u0085`, and ` `; a path with a backslash, a space, and a non-ASCII letter is unchanged; each formatter escapes its path (a newline in the path never reaches the returned line).

`types.ts` has no runtime behavior beyond the two constants, which the match-failure tests exercise.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. There is no manual end-to-end check for this piece because nothing calls the modules yet; plan 11 adds the first user-visible path.

## Out of scope

- The parser, usage lines, primer, and recognition predicates (plans 2b and 2c).
- Any filesystem effect, port change, or command wiring (plans 4 through 13), including `src/commands/file.ts` routing and `src/acp/tool-table.ts` recognition.
- Changing `file read` parsing, usage, or primer.
- The non-match failure message mapping (plan 11).
