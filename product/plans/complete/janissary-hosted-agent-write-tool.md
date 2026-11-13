# Add a janissary-hosted agent write tool to the ACP tool loop

**Complexity: 8/10** — ~570 added production lines, 17 existing files, 34 requirements and 48 scenarios (p=8.23).

Give ACP agents a host-provided file write and edit family so they can create and modify workspace files even when their harness's own write tool is denied. For a remote workspace, execution and confirmation must happen on its owning machine without materializing a local target, temporary file, or cached copy. The user explicitly permits existing history, transcript, and ACP recording behavior.

## Design decisions

The source feature was the first bullet under `## ready` in `product/backlog/features.md`. It had no separate heading; this title uses its opening phrase. Product and implementation decisions below include the user's answers and the two completed plan-review passes.

- Use Layer 2: a primer, an `AcpTool` entry, a command extracted from the reply's last recognized line, and host execution. No new ACP method.
- User decision: extend the existing file command family with `file write <JSON>` and `file edit <JSON>`. Each command takes one JSON object, allowing paths with spaces and escaped multiline content on one command line.
- Contain all writes to the workspace, including symlink resolution. Remote execution never falls back to local filesystem access.
- Use `FileSystemPort` to select local or remote filesystem execution. Remote whole-file writes already carry base64 content and an optional expected hash through `write-file`.
- Close edit read, match, replacement, and atomic write on the workspace machine.
- User decision: enforce role grants and command settings, as browser and database tools do, without an additional human approval prompt. Do not add an approval policy setting or mutation approval state.
- User decision: grant `file write` and `file edit` to the built-in `tell` role only. Keep the built-in `ask` grants unchanged. Existing saved roles retain their explicit grants; do not migrate them to add write access.
- User decision: `file write` creates or overwrites a file without requiring a content hash. An optional `expectedHash` requests the existing conflict check before replacement. Do not require a preceding read or add hash output to file reads for this feature.
- User decision: `file write` creates missing parent directories within the workspace so a nested file can be created in one operation. Directory creation must obey the same containment and symlink rules as the target file, on the machine that owns the workspace.
- User decision: for a local tab without a workspace clone, use the launch/project directory as the contained write root, matching `file read`. A local tab with a clone uses that workspace directory. Remote tabs always use their remote workspace and never fall back to a local root.
- User decision: apply the existing `file read` secret-path exclusions to both writes and edits, including `.env` files and `SECRET_DENY_PATHS`. Reuse that policy on the workspace machine before creating directories or modifying a file.
- User decision: support UTF-8 text only, rejecting invalid UTF-8 and binary files. Whole-file writes preserve the supplied text exactly, including its line endings. Edits preserve untouched text, including line endings and any BOM; do not normalize line endings.
- User decision: use fixed 5 MiB limits for files and mutation payloads, matching the existing file-read limit. For edits, check both the existing file and the resulting file. Do not add a size-limit setting.
- User decision: expose the same write and edit operations through typed `file` commands and core `ask`/`tell` ACP tools. Keep the separate autonomous `agent` command's grant model unchanged in this version. Core use still requires the selected role's explicit grants and effective command settings.
- User decision: edits match text exactly, requiring one occurrence by default. Refuse zero matches or multiple matches unless `replaceAll` is explicitly enabled; with `replaceAll`, replace every exact occurrence, still refusing zero matches. Refuse an empty search string. Allow an empty replacement string to delete matched text.
- User decision: write and edit paths are relative to the selected workspace or project root, matching `file read`. Reject absolute paths and paths that escape that root. Do not interpret paths relative to the tab's current directory.
- User decision: successful mutations return one line: `Wrote <path>.` for a whole-file write, or `Edited <path> (<count> replacements).` for an edit. Do not return a diff or resulting content hash. Use the root-relative path supplied by the caller and the actual number of replacements.
- User decision: `file write` accepts an empty content string to create an empty file or empty an existing file, subject to the same containment, secret-path, regular-file, permission, and optional hash checks.
- User decision: reject unknown JSON fields with a usage error before any filesystem changes. A misspelled option must not silently select default behavior.
- User decision: use `No matching text: <path>.` when an edit finds zero matches and `Multiple matches: <path>; set replaceAll to true.` when a single-replacement edit finds multiple matches. Reuse existing one-line filesystem failure vocabulary for other failures, as required by the backlog.
- User decision: expose `file write` and `file edit` as ordinary entries in the existing Roles command picker and Commands table. Inherit their existing layout, controls, keyboard behavior, states, and styling rather than adding a dedicated permissions panel.
- User decision: add a dedicated remote filesystem `edit-file` operation, rather than an edit mode on `write-file`. Reuse the existing operation registry, request/result validation, and port architecture. Bump the remote protocol version so incompatible peers are rejected before either mutation can run.
- User decision: preserve the existing remote ACP workspace-tool route. The remote-hosted loop executes writes and edits directly through `LocalFileSystemPort` on its own workspace machine. A typed command dispatched from the caller to a remote tab uses `RemoteFileSystemPort`. Do not forward remote ACP workspace mutations through the caller and then back to the remote.
- User decision: enforce the new text, size, secret-path, and parent-creation requirements through an explicit tool-write policy on the workspace machine. Apply that policy to typed file mutations and ACP file tools while preserving existing editor and binary-file write behavior. Do not impose the tool's restrictions on every existing filesystem write.
- User decision: place the new parser and command execution logic in focused modules under `src/file-write/`, extending the existing registered `file` command. Reuse file-read policy and filesystem-port mechanisms without consolidating or migrating all file commands into a new directory.
- User decision after review: preserve normal history, transcript, and ACP recordings, even when command text contains mutation payloads. The no-local-disk requirement applies to remote mutation targets, temporary files, and file-cache materialization; it does not prohibit existing recording behavior. Do not add recording redaction or disable recordings for this feature.
- User decision after review: if parent directories were created before a write failed, leave them in place. Report the failure and preserve any existing target file content. Do not add directory rollback tracking or cleanup of those directories.
- Define regular-file checks and one-line failures. Version any remote frame change so incompatible peers cannot silently ignore mutation semantics.

## What already exists (reuse, don't rebuild)

| Existing module | Established behavior |
| --- | --- |
| `src/acp/tool-table.ts` | Ordered browser, question, file, database tools; file tools run on the workspace; snapshot-based command and role checks. |
| `src/acp/drive-loop.ts` | Routes workspace and caller tools separately; remote loops execute beside the remote agent. |
| `src/commands/file.ts`, `src/file-read/tab-read.ts` | One registered file command; local read roots use the workspace or launch directory; remote reads use a scoped port without local fallback. The user chose the same root selection for writes. |
| `src/file-navigator/filesystem-port.ts` | `FileSystemPort.writeFile` and local containment, optional hash checking, symlink resolution, and atomic writes. Agent-specific regular-file, text, size, and conflict requirements need checking beyond this existing contract. |
| `src/file-navigator/remote/port.ts` | Encodes write bytes as base64 and sends `write-file` with optional `expectedHash`. |
| `src/remote/filesystem/write-file-operation.ts` | Decodes the request and invokes the remote filesystem port. |
| `src/file-navigator/file-operation-result.ts` | Shared structured success and failure results and filesystem failure vocabulary. |
| `src/file-read/read.ts:50`, `checkLexical` and `loadBytes` | Existing secret-path, physical containment, regular-file, size, and UTF-8 policy; private helpers need extraction for reuse. |
| `src/atomic-write.ts:8`, `atomicWriteFile` | Writes a sibling temporary file on the target filesystem, retains existing permissions, and renames atomically. Remote use therefore creates temporary output only on the remote. |
| `product/specs/acp.md`, `product/specs/roles.md` | Native command grants, application settings, built-in tool denial, and prompt snapshot semantics. |

## Proposed changes

Extend the existing file command owner with `file write <JSON>` and `file edit <JSON>`, each accepting one JSON object. Use the backlog's existing field names: write takes `path`, `content`, and optional `expectedHash`; edit takes `path`, `oldString`, `newString`, and optional `replaceAll`, which defaults to false. Require string values for paths and text and a boolean for `replaceAll`. Reject malformed JSON, non-object arguments, missing required fields, invalid field types, and unknown fields with usage text before filesystem effects. Keep parsing pure and filesystem effects behind the workspace's port. Add the native grant and settings vocabulary and primer integration through the existing registries.

Put the pure mutation parser, primer, and recognition predicates in `src/file-write/command.ts`, and tab-root/port routing in `src/file-write/tab-write.ts`. Keep filesystem policy and mutation effects in focused helpers behind the local port, with no source module exceeding the repository's 200-line limit. Extend `src/commands/file.ts` to delegate reads or mutations to the owning modules. Preserve existing file-read imports and behavior; extract shared policy only where both readers and writers need it.

Extract the existing path and secret checks from `src/file-read/read.ts:50` (`checkLexical`) into `src/file-read/policy.ts` for both consumers. Put the effectful tool write/edit helpers in `src/file-write/filesystem.ts` and shared port contract types in `src/file-write/types.ts`; the helpers must not import the port implementation. `LocalFileSystemPort.writeFile` delegates its tool-policy branch to these helpers. Add `editFile` to both port implementations. The remote port is already 193 nonblank, non-line-comment lines: extract its read/write/edit request wrappers into `src/file-navigator/remote/port-reads.ts` rather than exceeding the 200-line limit. Use direct imports with `.js` extensions and validate parsed JSON as `unknown` before reading fields.

Extend `FileSystemPort` with an edit contract and add `edit-file` to the remote operation registry. Its request carries `path`, `oldString`, `newString`, and `replaceAll`; its result reports either the replacement count or the existing structured failure. Read, match, replace, and atomic write all run on the far side. Keep the existing whole-file `write-file` operation distinct. Include request/result validation and an explicit remote protocol version change.

Extend the existing whole-file write contract with an explicit tool-write policy selector, carried through the local and remote ports and validated by the remote `write-file` descriptor. Its implementation applies the selected tool policy on the machine holding the filesystem before directory creation or replacement. Ordinary writes with no tool policy preserve their existing semantics, including binary writes. A peer that does not understand the selector must be rejected by the protocol version gate rather than silently ignoring it. The new edit contract is specific to the text tool and always enforces that policy.

Name the selector `policy`, accepting only the optional literal `tool-text`, as a trailing port argument and remote write argument; omission preserves the old behavior. `editFile` returns `FileOperationResult` carrying a positive integer `replacements` on success. Register `edit-file` in `src/remote/protocol-frames.ts:17` (`RemoteFilesystemOperation` and its arguments), `src/remote/filesystem/operations.ts:73` (`MUTATION_OPERATIONS`), and `src/remote/filesystem/result-decoders.ts:43` (`resultDecoders`), using a new `src/remote/filesystem/edit-file-operation.ts` descriptor and `refusedItem` for failure results. Add it to the long-running set in `src/file-navigator/remote/port-requests.ts:38`. Reuse request settlement and containment rather than adding another protocol dispatcher. Bump `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts:220` from the current 40 to 41, or the next unused version if another protocol change lands first.

Keep whole-file content's existing single base64 layer. The remote edit port encodes `oldString` and `newString` as UTF-8 base64 once; its descriptor decodes them on the owning machine before text matching, with no file-cache access. The general frame codec must not encode those fields again. Validate the new policy and edit arguments at the existing frame boundary and the replacement count when decoding the reply.

Extend the workspace command runner used by `src/remote/serve-acp-loop.ts` so remote-hosted ACP loops execute file reads, writes, and edits on that machine through its local port. Preserve caller-side browser, database, and question routing. A typed file mutation on a remote tab instead uses its scoped remote port, with no file-cache path and no local disk fallback. Both routes use the same parser, policy, and workspace filesystem implementation. Dispose temporary scoped ports alongside their requests, following the existing file-read lifecycle.

Also update `src/acp/run-prompt.ts:82` (`host.runWorkspace`), which currently calls only `readFileInTab`, to route mutations through the tab mutation runner. Export the shared root-and-port mutation executor from `src/file-write/tab-write.ts` for `src/remote/serve-acp-loop.ts:37` to call with its own local port; retain the separate read runner. A second forwarding-only runner module is unnecessary. Extend the existing file entry in `src/acp/tool-table.ts:33` (`createAcpToolTable`) with mutation primer/recognition, preserving the file owner and workspace routing. Recognize a write/edit prefix even when its JSON is invalid so malformed requests return usage text rather than being displayed as a successful final answer.

Append both native names to `src/plugins/roles/shared.ts:3` (`NATIVE_ACP_COMMANDS`) and only the built-in tell grants in `src/plugins/roles/roles-file.ts:27` (`DEFAULT_ROLES`). `src/application-commands.ts:72` already derives command rows and their file parent from that vocabulary; no new UI registry or tool-owner union is needed. Preserve snapshot-based core settings, role refusals, the eight-step limit, and `withoutTools` behavior. Typed commands use ordinary enabled-command dispatch without requiring an ACP role grant.

Protect the chosen autonomous-agent boundary: `src/acp/tool-table.ts:118` (`gateAgentCommand`) currently routes any non-read command to the caller, and `src/agent/command-tools.ts:17` (`runGrantedAgentCommand`) grants the entire registered `file` command. Explicitly refuse write/edit forms in both agent paths using their existing `Agent: command not permitted: <command>.` result. This prevents a pre-existing file grant from acquiring new mutations; it does not add autonomous write integration or a new grant model.

Add `file write` and `file edit` to the built-in `tell` grants without changing built-in `ask` or existing saved roles. Expose the same operations through typed file commands and core `ask`/`tell` tools, leaving autonomous `agent` grants unchanged. Whole-file writes allow create or overwrite and forward an optional `expectedHash` through the existing port contract. Create missing parent directories on the workspace machine, checking containment before directory creation as well as file replacement. Reuse local file-read root selection: workspace directory when present, otherwise launch/project directory. Keep the operations UTF-8 text only with exact supplied text and no newline normalization. Enforce fixed 5 MiB limits on files and mutation payloads, including an edit's resulting file. An edit requires an existing regular text file; a missing file returns the existing not-found failure, and an empty file has no match for the required nonempty search text. Update the matching ACP, roles, command, and remote behavior specs during implementation.

Validate lexical paths, the nearest existing ancestor, and the resolved target against the real root and secret policy before directory creation. Recheck the resolved destination before the atomic write; local tool writes need the physical checks too, because the existing local port's `containedPath` alone is lexical. Reject directories, special files, NUL-containing binary text, invalid UTF-8, and invalid surrogate sequences without opening special files for content reads. Preserve BOM explicitly when decoding existing text for an edit. Match literal, non-overlapping occurrences without regex interpretation. Check byte growth before allocating an oversized result. Apply 5 MiB to the UTF-8 JSON argument and separately to decoded file/text data; base64 transport overhead is not file content. Repeat data/path validation remotely rather than trusting caller-side checks. Use the existing content hash convention, including its BOM handling, and preserve its missing-target create behavior when an expected hash was supplied. Do not suppress permission or other I/O failures as successful preconditions.

The synchronous workspace mutation performs validation, optional hash checking, edit matching, and atomic replacement in one owning-process call without an intervening await. Reuse the existing remote failure deadlines and do not retry a timed-out or disconnected mutation: it may already have committed. Cancellation prevents work that has not started and suppresses late results/turns; it cannot undo a committed write. Do not claim compare-and-swap protection against an independent process changing files between the hash check and rename, or immunity to hostile concurrent filesystem changes beyond the repository's existing containment model.

Use `Usage: file write <JSON>` and `Usage: file edit <JSON>` for malformed requests, including an empty search string. Preserve existing `file read` usage for read requests. Reuse `Outside the workspace: <path>.`, `Secret file: <path>.`, `File not found: <path>.`, `Is a directory: <path>.`, `Not a text file: <path>.`, and `File too large (>5 MB): <path>.` where applicable. Preserve `SAVE_CONFLICT_ERROR` from `src/editor/save-conflict.ts:7` and `fileOperationReason` for permission and other filesystem failures. Reuse existing remote unavailable/ended/timeout messages. Escape path control characters in displayed messages so output remains one line; never include file content in errors.

Use `JSON.parse` plus the existing `isRecord` guard in `src/value-guards.ts:10`, `Buffer.byteLength`, fatal UTF-8 `TextDecoder` with BOM preservation, and native literal string operations for the parser and edit implementation. Replacement text must remain literal even when it contains `$&` or similar substitution markers; a split-and-join replacement avoids regex or replacement-template semantics. Reuse `requireString`, `requireBoolean`, and `descriptorFor` from the existing remote operation pattern. Add no dependency, generic policy framework, new tool owner, queue, lock service, or UI component. The v1 ceiling is the chosen 5 MiB text size and synchronous owning-process mutation; future larger-file support would require a separate design rather than silently adding streaming or chunking here.

Implementation order: shared policy/contracts and local filesystem behavior; remote descriptors, ports, decoders, and version gate; command and core-loop integration plus the autonomous refusal boundary; grant defaults, tests, and docs. There are no prerequisite feature plans. Update `product/specs/acp.md`, `product/specs/roles.md`, `product/specs/remote-server.md`, `product/specs/application-commands.md`, `help/file.md`, and the existing file command row in `help/commands.md` when implementing, without adding a duplicate command page.

Preserve existing history, transcript, and ACP recording paths, including `src/command/manager.ts:17`, `src/acp/run-prompt.ts:97`, and `src/acp-records/store.ts:77`. The user's final review decision permits those recordings to contain mutation command payloads. Assertions about avoiding local disk mutation must target remote file targets, temporary file copies, and file-cache materialization rather than forbidding ordinary record persistence.

If directory creation succeeds but the file write fails, retain those directories and return the failure; preserve existing target content through the existing atomic-write behavior. Do not roll back parent creation. Validation failures discovered before directory creation must still have no directory or file effects.

## UI design

Add `file write` and `file edit` as ordinary native command entries in `web/src/plugins/roles/RoleCommands.tsx` and its `CommandPicker`, and in the existing Commands table. The user chose to inherit the existing layout, controls, keyboard behavior, states, and styling. Open them through the existing `roles` and `commands` routes; add no new panel or key binding.

The Roles picker retains its existing first-control focus, Escape cancellation, return focus, disabled Add state, removal controls, and restriction indicators. Keep its accessible names, including `Command to add to role <name>` and `Remove <command>`. Empty lists, narrow layouts, and updates while the picker is open retain the existing Roles behavior.

The Commands table retains Enabled and Agent access checkboxes, inherited parent restrictions, pending-save disabling, server refusal display, keyboard navigation, and horizontal scrolling in narrow panes. The server remains authoritative for grants, settings, availability, and mutation results. The client owns only existing ephemeral picker and focus state.

Keep any necessary client work within the existing feature directories `web/src/plugins/roles/` and `web/src/plugins/commands/`. Reuse their pure modules and hooks with thin components and no cross-feature imports. The vocabulary-driven entries do not justify a new file-write UI feature directory or service.

The user chose no additional approval prompt, so no mutation-specific question panel, approval controls, or waiting state is included.

## Tests

Use colocated server tests beside the file parser/executor and filesystem operations for create, replace, edit matching, containment and symlink escapes, missing files, conflicts, non-regular files, encoding, caps, permission failures, and remote results. Extend ACP table and loop tests for grants, settings, built-in denial independence, and routing. Verify that built-in `tell` grants both mutations, built-in `ask` does not, and existing saved roles receive no automatic grants.

Cover creation of nested missing parent directories locally and remotely, refusal when an existing ancestor is a file or an escaping symlink, and permission failures during parent creation.

Verify a failure after parent creation leaves those directories in place and preserves existing target file content, without rollback attempts.

Verify local root selection with and without a workspace clone, containment to the selected root, and refusal rather than local fallback when a remote workspace is unavailable.

Verify that writes and edits reject the same secret paths as file reads, including aliases through symlinks, without creating parent directories or modifying files.

Verify UTF-8 validation, binary-file refusals, exact whole-file content, and preservation of untouched LF, CRLF, mixed line endings, and BOM during edits.

Cover zero, one, and multiple exact matches; explicit replace-all behavior; rejection of empty search text; and deletion through empty replacement text. Refused edits must preserve the file.

Verify exact success output for whole-file writes and edits, including the replacement count, without a diff or content hash.

Cover empty-content creation and replacement, including refusal without changes when an optional expected hash conflicts.

Cover unknown JSON fields, including a misspelled `replaceAll`, returning usage errors without creating directories or changing files.

Verify the exact edit-match error messages and missing-file refusal. Malformed JSON, non-object arguments, omitted required fields, and wrong field types must also produce usage text without effects.

Cover the exact 5 MiB boundary and oversized mutation payloads, existing files, and resulting edited files; refused operations must leave file content unchanged.

Verify the tool-write policy is transmitted and enforced remotely, that incompatible peers cannot ignore it, and that ordinary editor and binary-file writes retain their existing behavior when the selector is absent.

Remote tests must demonstrate that writes and read-modify-write edits affect only the remote workspace, never materialize local target files, temporary copies, or file-cache entries, fail on incompatible peers, and do not retry mutations with uncertain outcomes. Existing local recordings remain permitted. Cover command and role refusals without opening an approval question. Reuse UI tests for changes to the existing grant surfaces.

Concrete test locations: new `src/file-write/command.test.ts` and `filesystem.test.ts` for parsing and owning-machine policies, and `src/file-write/tab-write.test.ts` for shared execution and root/port selection; existing `src/acp/tool-table.test.ts`, `drive-loop.test.ts`, and `run-prompt.test.ts` for both ACP execution routes; `src/remote/filesystem/operations.test.ts`, `src/remote/protocol.test.ts`, `src/remote/serve-file-navigator.test.ts`, `src/remote/serve-acp-loop.test.ts`, and `src/file-navigator/remote/port.test.ts` for frames, base64, validated results, direct remote execution, timeouts, and disposal. Extend `src/agent/command-tools.test.ts` and agent gate/remote-loop tests to prove file grants still refuse mutations. Keep existing read, binary port, role-default, command inventory/policy, and UI vocabulary tests green. Add no browser harness solely for data-driven vocabulary entries.

## Out of scope

- New ACP methods or re-enabling harness-native write tools.
- Writes outside the workspace.
- Writes and edits to paths excluded by the existing file-read secret policy.
- Local temporary files, local file-cache materialization, or local fallback for remote mutation content.
- Fetching a whole remote file locally to perform an edit.
- Additional human approval prompts, configurable approval policies, and mutation approval state.
- Mandatory read-before-write workflows and adding content hashes to file-read output.
- Binary-file mutations, non-UTF-8 text, and automatic newline normalization.
- Extending the separate autonomous `agent` command's grant model or adding its write/edit integration.
- Returning mutation diffs or resulting content hashes in tool output.
- Redacting mutation payloads from normal recordings or disabling existing recording behavior.
- Rolling back newly created parent directories after a failed write.

## Verification

Run `$janissary/scripts/run.mjs check-diff` for each plan change and during implementation.

Manual implementation check: with a harness whose internal write tool is denied, create and edit a file in a local workspace, then repeat in a remote workspace with a same-named local sentinel file. Confirm the remote result and unchanged local sentinel, reject an outside-workspace path, and verify a disconnected remote never falls back to local writing. Verify that allowed mutations run without an approval prompt and that role grants and command settings still refuse unauthorized mutations.
