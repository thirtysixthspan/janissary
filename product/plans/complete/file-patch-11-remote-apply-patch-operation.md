# File patch 11: far-side `apply-patch` filesystem operation and protocol 44

**Complexity: 5/10** — ~25 added lines, 4 files edited, 7 requirements, 11 test scenarios (p=5.39)

Run order: 11 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-8-apply-runner-output.md` (`applyPatchText` in `src/file-patch/apply.ts`) and `./product/plans/ready/file-patch-10-remote-operation-extractions.md` (room in `operations.ts`, and `decodeBase64Text` and `requireBase64Text` exported from `argument-checks.ts`). Both must land first: neither `src/file-patch/` nor the exported decoder pair exists today.

This subplan teaches the far side of a remote connection to apply a patch in its own workspace. It adds one mutation operation that carries the patch text across, runs the same `applyPatchText` a local tab runs, and returns the output text. The whole transaction runs on the far side, so a dropped connection can't leave a half-applied patch. The near-side port method that sends it comes in subplan 12.

## Goal

A registered `apply-patch` operation in `MUTATION_OPERATIONS` (`src/remote/filesystem/operations.ts`), with its argument and result types, its validator and result decoder, and a protocol version bump so a peer without it is refused at the handshake.

## Design decisions

From the source plan:

- **Descriptor.** A new `src/remote/filesystem/apply-patch-operation.ts` exporting `applyPatchOperation`, built with `descriptorFor<'apply-patch'>()` and modeled on `editFileOperation` in `src/remote/filesystem/edit-file-operation.ts`. `valid` and `decode` accept exactly one argument, `patchText`, holding base64-encoded UTF-8, checked with `decodeBase64Text` and decoded with `requireBase64Text` from `argument-checks.ts`. `paths` returns `[]`, because the far side checks each section path itself through `resolveMutationTarget` inside `applyPatchText`. There's no `refusal`, so a near-side connection failure rejects with its reason, as `glob-paths` does. `run` returns `{ text: applyPatchText(context.root, args.patchText) }`.
- **Types.** `'apply-patch'` joins the `RemoteFilesystemOperation` union in `src/remote/protocol-frames.ts`, and `RemoteFilesystemArgumentsByOperation` gains `'apply-patch': { patchText: string }`. The result type `{ text: string }` is inferred from the decoder, as for every operation (`RemoteFilesystemOperationResult` in `operations.ts`).
- **Result decoder.** `resultDecoders['apply-patch']` in `src/remote/filesystem/result-decoders.ts` requires a record whose `text` is a non-empty string. Anything else is rejected as an invalid result (`Invalid remote filesystem operation result.`), as the other decoders do.
- **Protocol.** `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` goes up by one, with a comment naming `apply-patch`. The source plan said 42 to 43, but `file grep` (#2005) already took 43 for `grep-files` (`export const REMOTE_PROTOCOL_VERSION = 43;` today), so this is 43 to 44: one past the version when this lands, which is what the source intends. If another bump lands first, take one past whatever is current and adjust the comment, spec, and test to match. A version-43 peer is refused at the handshake rather than refusing the unknown operation after connecting.
- **No fallback.** A remote tab's patch only ever runs on the far side.

Decided here:

- **Exact keys.** `valid` requires the argument object's keys to be exactly `patchText` (`Object.keys(args)` is `['patchText']`), so an extra argument is an invalid request, matching the strict command JSON. This is stricter than `grep-files`, whose decoder drops extra keys; the precedent for a key-count check is `noArguments` in `operations.ts` (`Object.keys(args).length === 0`). `decode` builds only `{ patchText: requireBase64Text(args.patchText) }`, so it carries exactly that key even when called without `valid`. An invalid request never reaches `run`: `decodeRequest` in `src/remote/frame/decode-filesystem.ts` calls `descriptor.valid` and answers `Malformed remote frame "filesystem-request".`.
- **Decoded form in the type.** As with `edit-file`, the `{ patchText: string }` argument type holds the decoded text. Base64 exists only on the wire: subplan 12's sender encodes it, and the frame decoder's `decode` turns it back into text before `run` sees it.
- **Empty text.** An empty `patchText` (the empty base64 string) is a valid request. The far side runs `applyPatchText(root, '')` and returns whatever line it produces; this operation adds no rule of its own about patch content.
- **Leading BOM.** `decodeBase64Text` decodes with `ignoreBOM: true`, so a leading U+FEFF in the patch text survives as text, as it does for `edit-file`. The parser then sees it as part of the first line, the same as on a local tab.
- **No `rootDestination`.** `paths` returns no paths, so `refusedPaths` in `src/remote/filesystem/refusal.ts` has nothing to check and the flag would change nothing. The descriptor sets only `valid`, `decode`, `paths`, `decodeResult`, and `run`.
- **Placement.** `'apply-patch': applyPatchOperation` goes in `MUTATION_OPERATIONS` directly after `'edit-file': editFileOperation`. The union member goes right after `'edit-file'` on the union's second line, and the argument entry right after `'edit-file'` in `RemoteFilesystemArgumentsByOperation`. The result decoder goes right after `'grep-files'`, beside the other `{ text }` decoders.
- **Imports.** `apply-patch-operation.ts` imports `decodeBase64Text` and `requireBase64Text` from `./argument-checks.js`, `descriptorFor` from `./operation-types.js`, `resultDecoders` from `./result-decoders.js`, and `applyPatchText` from `../../file-patch/apply.js`, all with `.js` extensions per the NodeNext rule. No barrel, no re-export.
- **Line budget.** After subplan 10, `operations.ts` is at about 172 counted lines, and this adds two (an import and the entry). `protocol-frames.ts` (168 counted), `result-decoders.ts` (83), and `protocol.ts` all stay well under 200. The new module is about 15 lines.
- **Deadline.** `apply-patch` becomes a long-running operation for the request deadline. That entry lives in `LONG_RUNNING` in `src/file-navigator/remote/port-requests.ts` and lands with the near side in subplan 12. Nothing in this subplan touches it, and the build doesn't require it, since `LONG_RUNNING` is a plain `Set`, not an exhaustive record.
- **Far side runs the runner directly.** `run` calls `applyPatchText`, not `context.filesystem.applyPatch`, because the port method doesn't exist until subplan 12 and the source plan names `applyPatchText` here. Both reach the same function.
- **Synchronous run.** `applyPatchText` is synchronous, so `run` returns a plain object. `RemoteFileNavigators.request` in `src/remote/serve-file-navigator.ts` wraps the result in `Promise.resolve` and replies with it.
- **Thrown errors.** If `applyPatchText` throws (a bug, since it reports failures as text), the `try`/`catch` around `this.dispatch(frame)` in `RemoteFileNavigators.request` answers with an error reply carrying the message, and the near side rejects with that message. Subplan 13 prints it as `Patch failed: <reason>.`. This subplan adds no catch of its own.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Mutation operation precedent | `editFileOperation` in `src/remote/filesystem/edit-file-operation.ts` | Descriptor shape, base64 text argument. |
| No-refusal precedent | `globPathsOperation` in `src/remote/filesystem/glob-paths-operation.ts` | An operation with no `refusal` rejects on a connection failure. |
| Exact-key precedent | `noArguments` in `src/remote/filesystem/operations.ts` | Key-count check in `valid`. |
| Operation table | `MUTATION_OPERATIONS`, `FILESYSTEM_OPERATIONS` in `src/remote/filesystem/operations.ts` | Registration. Its `satisfies Record<RemoteFilesystemOperation, AnyOperationDescriptor>` makes a union member without an entry a build error. |
| Descriptor helper | `descriptorFor` in `src/remote/filesystem/operation-types.ts` | Types the descriptor against the `'apply-patch'` arguments. |
| Base64 decoder | `decodeBase64Text`, `requireBase64Text` in `src/remote/filesystem/argument-checks.ts` (moved there by subplan 10) | Argument check and decode. |
| Result decoders | `decodeResult` and `resultDecoders` in `src/remote/filesystem/result-decoders.ts` | The `apply-patch` decoder, like the `grep-files` one plus a non-empty check. |
| Request validation | `decodeRequest` in `src/remote/frame/decode-filesystem.ts` | Already rejects a request whose `valid` fails. Unchanged. |
| Containment | `refusedPaths` in `src/remote/filesystem/refusal.ts` | Reads `paths`; with `[]` it refuses nothing, leaving containment to `applyPatchText`. Unchanged. |
| Far-side dispatch | `RemoteFileNavigators.request` in `src/remote/serve-file-navigator.ts` | Runs the descriptor and turns a throw into an error reply. Unchanged. |
| Protocol version | `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` | The bump and its comment, in the style of the `// Version 43 adds the read-only \`grep-files\` operation` comment. |
| Runner | `applyPatchText` in `src/file-patch/apply.ts` (subplan 8) | What the far side runs. |

## Proposed changes

- New `src/remote/filesystem/apply-patch-operation.ts` exporting `applyPatchOperation`.
- `src/remote/filesystem/operations.ts`: import it from `./apply-patch-operation.js` (beside the `editFileOperation` import) and add `'apply-patch': applyPatchOperation` to `MUTATION_OPERATIONS` after `'edit-file'`.
- `src/remote/protocol-frames.ts`: the union member and the argument type.
- `src/remote/filesystem/result-decoders.ts`: the decoder, `decodeResult<{ text: string }>` with a check that the value is a `record` whose `text` is a string of length at least 1.
- `src/remote/protocol.ts`: 43 to 44, with a comment appended after the version-43 one saying version 44 adds the `apply-patch` mutation, which carries a whole patch to the far side to apply in its own workspace, and that a version-43 remote would refuse it as unknown after the handshake had already passed, so the exact-version handshake refuses that pairing first.
- `product/specs/remote-server.md`: a paragraph for protocol version 44 after the `Protocol version 43 adds \`grep-files\`` one. It describes `apply-patch`: one base64 `patchText` argument decoded strictly (any other argument shape, including an extra key, is an invalid request), the far side applying the whole patch in its own workspace with the same rules and output as a local tab and checking every section path itself, the `{ text }` reply, an empty or malformed reply rejected as an invalid result, no refusal shape so a connection failure rejects, the long request deadline (whose code lands in subplan 12), and the handshake refusing a version-43 peer.

Land it as one commit: the union member, the argument type, the table entry, and the decoder must agree for typecheck to pass, and `VALID_RESULTS` in `operations.test.ts` is a mapped type over the union, so its entry lands in the same change.

## Tests

- `src/remote/filesystem/operations.test.ts`, extending its existing tables and cases:
  - `ALL_OPERATIONS` gains `'apply-patch'`, so the table-coverage, `isFilesystemOperation`, and malformed-`null`-result cases cover it.
  - `PATH_CASES` gains an `apply-patch` record with a base64-encoded patch text and expected paths `[]`. That also covers acceptance by `valid` and the "decodes to the keys it carries" case.
  - `INVALID_CASES` gains `apply-patch` records for: no `patchText`, a non-string `patchText`, a valid `patchText` plus an extra key, non-canonical base64 (`'!!'`, as for `edit-file`), and base64 of a non-UTF-8 byte (`Buffer.from([0xff])`, as for `edit-file`).
  - `VALID_RESULTS` gains `'apply-patch': { text: 'Patched 1 file:\nA a.md' }`.
  - A case that `decode` turns base64 into plain text (including a non-ASCII character), keeps a leading byte order mark, and throws `Invalid remote filesystem operation arguments.` for `'!!'` when called without `valid`, like the `edit-file` decode and BOM cases.
  - A case that the `apply-patch` decoder rejects `{ text: '' }`, `{}`, `{ text: 3 }`, `null`, and `[]`, like the `grep-files` result case.
  - The "names a refusal shape for exactly the operations whose result can carry one" and "treats an empty path as the root only for …" lists stay unchanged. They now pin that `apply-patch` has neither `refusal` nor `rootDestination`.
- `src/remote/serve-file-navigator.test.ts`, through the existing `request` helper with arguments decoded by `operationDescriptor('apply-patch').decode`, as the `edit` helper does for `edit-file`:
  - An `*** Add File: a.md` patch replies `{ result: { text: 'Patched 1 file:\nA a.md' } }` and the file exists under the temp root.
  - A `*** Delete File: ../outside.txt` patch replies with a successful result whose `text` is `Patch failed at section 1 (Delete File: ../outside.txt): Outside the workspace. No files were changed.`, not an error reply, and nothing outside the root is touched. This pins that `paths: []` passes the central containment check and leaves the refusal to `applyPatchText`.
- `src/remote/protocol.test.ts`: the version test (`it('is 43', …)` with `toBe(43)` today) becomes `it('is 44', …)` with `toBe(44)`.

## Verification

- `$janissary/scripts/run.mjs check-diff`, confirming no `max-lines` error on `operations.ts` and that the three test files above pass.
- No manual check: no near-side sender exists until subplan 12.

## Out of scope

- The near-side `RemoteFileSystemPort.applyPatch`, `remoteApplyPatch`, and the `LONG_RUNNING` deadline entry (subplan 12).
- Printing a far-side rejection as `Patch failed: <reason>.` (subplan 13).
- Falling back to the local machine for a remote tab (source plan, Out of scope).
- Any change to `applyPatchText`'s output or rules (subplan 8).
