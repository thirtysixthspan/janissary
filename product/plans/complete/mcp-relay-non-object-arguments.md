# Answer non-object remote MCP arguments with the exact malformed-arguments error

**Complexity: 3/10** — ~6 added lines in 1 production file, 8 requirements and 10 test scenarios, no new modules or wire types (p=4.73).

## Goal

A remote `mcp-call` carries its arguments as JSON text. Today any syntactically valid JSON passes the relay's parse and reaches the local executor, so a frame encoding `null`, a string, an array, a number, or a boolean produces an implementation-specific error — or a no-tab result — instead of the documented malformed-arguments answer, and its call id is left pending. This change rejects non-object JSON at the relay before the pending entry is written and answers it with the exact error already promised for a parse failure, so every malformed call gets one predictable answer and a later valid call with the same id can still register.

## Requirements

1. Parsed arguments that are a non-null, non-array object — "require the result to be a non-null, non-array object before calling the executor" — continue to the executor.
2. Parsed arguments that are `null` are answered with isError true and the exact text `Malformed MCP arguments: <the frame's args>`.
3. Parsed arguments that are a string are answered with isError true and that same exact text.
4. Parsed arguments that are an array are answered with isError true and that same exact text.
5. Parsed arguments that are a number are answered with isError true and that same exact text.
6. Parsed arguments that are a boolean are answered with isError true and that same exact text.
7. A rejected non-object call writes "without inserting an entry into the pending map", so its id is not held as in flight.
8. "a later valid call with the same id" after a rejected non-object call registers normally and answers from its own execution.

## Design decisions

- **Check the parse result in the relay, not the executor.** The relay already owns the parse and the malformed-arguments answer, so the object-shape check belongs immediately after `JSON.parse` and before the pending write; the executor keeps its existing argument contract.
- **Treat shape failure exactly like parse failure.** "answer with the same `Malformed MCP arguments: ${frame.args}` isError result used for a parse failure" — the rejected call uses the identical `answer` call and the identical text built from the raw `frame.args`, not from the parsed value.
- **Return before pending insertion.** The shape guard returns from `handle` before `new AbortController()` and `pending.set`, so a rejected call neither occupies an id nor needs a cancel path.
- **Use `typeof` plus null and array checks.** A plain `typeof value === 'object' && value !== null && !Array.isArray(value)` admits only JSON objects and rejects every other JSON value, matching "non-null, non-array object".

## Preserved behavior

1. Valid object arguments reach the executor and settle into a normal answer; they must never receive a malformed-arguments error. Pinned by `answers a re-sent settled call from the stored result without registering again`.
2. A re-sent in-flight call attaches to the existing question instead of registering a second; it must not create a new pending entry. Pinned by `attaches a re-sent call to the in-flight question instead of registering a second`.
3. Closing a channel clears the pending map so a re-send registers a fresh question; stale entries must not survive a close. Pinned by `clears the map on channel close so a re-send registers a fresh question`.
4. Syntactically invalid argument text still answers with the malformed-arguments error and registers nothing; it must keep the same text as before. Pinned by `answers malformed arguments as an error and lets a later valid call with the same id register`.

## Assumptions

1. `frame.args` is JSON text parsed once by `JSON.parse(frame.args)` at `src/remote/mcp-relay.ts:28`, so the shape check reads the parse result, not the raw string.
2. The local executor destructures arguments as an object — `const { tab: requested, kind, question, options } = args as QuestionArgs;` at `src/mcp/executor.ts:11` — so a non-object cannot be a valid argument payload.
3. The malformed-arguments answer is already centralized in the local `answer` helper at `src/remote/mcp-relay.ts:15`, so a shape failure can reuse it without a new messaging path.

## Existing functionality

1. The `answer` helper builds and sends an `mcp-result` frame — `const answer = (call, result) => send(...)` at `src/remote/mcp-relay.ts:15` — reused for both parse and shape failures.
2. The `catch` branch of the existing parse answers malformed arguments with isError true — `text: \`Malformed MCP arguments: ${frame.args}\`` at `src/remote/mcp-relay.ts:30` — the exact result the shape guard must match.
3. The `pending` map and its `set` at `src/remote/mcp-relay.ts:35` are the single insertion point the guard must precede.
4. The colocated relay tests at `src/remote/mcp-relay.test.ts` provide the `fixture()` helper and the send/register assertions the new cases mirror.

## Implementation steps

1. In `src/remote/mcp-relay.ts`, immediately after the `try`/`catch` that assigns `args` from `JSON.parse(frame.args)`, add a guard that answers with `{ text: \`Malformed MCP arguments: ${frame.args}\`, isError: true }` and returns when the parsed value is not a non-null, non-array object. Keep the parsed value's declared type as the executor's object argument type so the valid path is unchanged. No new module, type, or import is needed, and the file stays well under the 200-line limit. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Confirm the guard sits before `new AbortController()` and `pending.set(frame.call, entry)` so a rejected call leaves no pending entry and needs no cancel handling. Build command: `$janissary/scripts/run.mjs check-diff`.

## User interface

1. There is no terminal UI surface changed by this fix. The only user-visible effect is the text of the `mcp-result` frame answered to a remote caller that sent non-object arguments: it now reads `Malformed MCP arguments: <sent args>` with isError true instead of an executor-specific error or a no-tab result.

## Tests

Tie every new case to a requirement above, in `src/remote/mcp-relay.test.ts` (vitest project `server`, colocated `*.test.ts`), using the existing `fixture()` helper and `send`/`register` assertions:

- Requirements 2–6: one case each for parsed `null`, a JSON string, a JSON array, a JSON number, and a JSON boolean, calling `relay.handle` with `JSON.stringify(value)` as `args` and asserting the exact `{ type: 'mcp-result', call, text: \`Malformed MCP arguments: ${args}\`, isError: true }` frame.
- Requirement 7: in each of those cases, assert `register` was not called, proving no pending entry reached the executor.
- Requirement 8: in one of those cases, send a later valid call with the same id and assert it registers and answers from its own execution, mirroring the existing malformed-syntax case.
- Preserved behavior: the existing success, re-send dedupe, clear-on-close, malformed-syntax, and cancel tests remain unchanged and keep passing.

## Out of scope

- Changing the wire format of `mcp-call` or `mcp-result`, or bumping the protocol version.
- Validating the contents of an object-shaped args payload, or changing executor behavior for valid calls.
- Changing cancellation handling, the pending map's lifetime, or the text used for malformed syntax.
- Editing user or developer documentation; those trees are owned by `update-documentation.md`.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, server typecheck, and the `server` tests all pass.
- Update the protocol paragraph in `product/specs/remote-server.md` to record that non-object arguments are answered with the malformed-arguments error and leave no pending call.
- Manual check: in a remote MCP session, send an `mcp-call` whose `args` encode `null`, a string, and an array in turn; each answer must be an error frame reading `Malformed MCP arguments: <the exact args sent>`, and a follow-up valid call using the same id must register and answer normally. A failure looks like a no-tab answer, a `TypeError` message, or a re-send that silently receives no new answer.
