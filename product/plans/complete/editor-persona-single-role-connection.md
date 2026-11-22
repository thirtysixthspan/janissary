# Editor persona queries launch and list one role-based connection

**Complexity: 4/10** — ~14 added lines, 3 production files, 6 requirements and 9 scenarios (p=4.98); an option on the shared core entry plus scoped tests and spec/doc edits.

## Goal

An in-editor persona request launches exactly one ACP connection — the role-based persona session — and that one connection is the only one listed on both connection surfaces. The legacy durable core connection record that the persona prompt path opens alongside the live role session is removed from the editor path: the role-based session carries the persona's instructions and its recorded exchange, and the response is extracted from it. Ask and tell sessions, monitors, and the launcher are unchanged.

## Approach

The editor suggestion handler already routes the request through `promptPersonaRole`, which opens the role-keyed persona session, primes it with the persona body and hunk format, and extracts the reply. The same call also opens a durable core ACP record through `beginCoreRecord`. That record is the legacy connection: it is listed as a second ACP row in the connections tab while the live persona row is the one the popup shows. The fix threads an explicit "no durable record" option through the shared core entry and uses it only for editor persona prompts. Everything else in the core path — role resolution, model queue and fallback, command grants, internal-tool denial, the tool loop, and the recorded exchange the popup snapshots — stays as it is.

## Implementation steps

1. Add an optional `record?: boolean` option to `promptPersonaRole` in `src/acp/persona-role.ts`, defaulting to `true` so monitors keep their records. When it is `false`, skip the `beginCoreRecord` call. The later record-feed calls (`promptCoreRecord`, `coreActivity`, `replyCoreRecord`, `answerCoreRecord`, `closeCoreRecord`) already no-op without a begun record id, so no other guard is needed.
2. Pass `record: false` from `editorSuggest` in `src/editor-suggest/handler.ts`. The persona body and hunk format are still sent through the role entry and the reply is still recorded on the role-based session with `editorAcp.record`, so the live row's transcript holds the instructions and the extracted response.
3. Remove the now-dead `_cwd` parameter from `EditorAcpManager.session` in `src/editor/acp-manager.ts` and drop the corresponding argument from `editorSuggest`, making the editor path free of the legacy raw-session plumbing.
4. Update the functional specs for connections, the connections tab, and ACP so they describe editor persona sessions as live-only with no retained core record, while monitors keep theirs. Update the editor persona query and connections user-documentation pages where they describe the retained record.

## Tests

1. `src/editor-suggest/handler.test.ts`: assert `promptPersonaRole` is called with the no-record option, that the primed prompt contains the persona body and hunk format, and that the input and reply are recorded on the role slot.
2. `src/acp/persona-role.test.ts`: a call with `record: false` reaches its launchable entries, runs the prompt, and opens no record; the default and an explicit `true` still open one.
3. `src/editor-suggest/death-notice.test.ts`: drive a real editor persona query and assert exactly one ACP session is connected, the no-record path runs, and the connection catalog and connections topic each list exactly one persona row with no durable record row.
4. `src/plugins/connections-topic-rows.test.ts`: an editor persona live row with no matching record produces a single row in the connections tab.

## Out of scope

The editor `>` request line, hunk parsing and review UI are unchanged. Ask and tell sessions, monitor sessions, and the launcher summarizer keep their durable records and their current connection behavior. The connection record schema, validation, and wire contract are untouched. No protocol message, RPC, command, notification, or key binding changes. No PR description edit is required.
