# In-editor persona suggestions

## Summary

Give an editor tab a way to ask a persona for a change to the text it is editing and apply the answer inline, without leaving the buffer and without going through a monitor reporting tab. The user writes a request line in the buffer led by `>` and the persona's name — e.g. `> summarizer rewrite this paragraph in one sentence` — and completes the persona name by tab-completion after the `>`. Pressing Ctrl/Cmd+Enter on that line fires a single-shot query to the named persona, priming it with the editor's current content (including any unsaved edits) plus the request. The persona replies with one or more proposed edit hunks that may target anywhere in the file. Each hunk is rendered inline as a pending change titled `(A)ccept or (D)ecline this change?`; the user presses `a` to apply the focused hunk or `d` to dismiss it, one hunk at a time. The `>` request line is removed from the buffer only if at least one hunk is accepted; if every hunk is declined (or the persona had nothing to suggest), the request line stays so the user can edit and retry. Failures and empty replies surface as notifications in the notifications tab.

This plan covers only the **in-editor suggested-edit surface**. Delivering editor suggestions into a monitor reporting tab already ships today (see `monitoring.md`'s editor-view target) and is out of scope.

## Design decisions

1. **Request syntax is a `>`-led line naming the persona.** A request is a single buffer line whose first non-whitespace character is `>`, immediately followed by a known persona name, then the prompt text: `> <persona> <prompt>`. The persona name is matched case-insensitively against the personas available to `monitor` (the `.md` files in `ai/personas/`, via `listPersonas` in `src/personas.ts`). Everything after the persona name on that line is the prompt.

2. **Persona name completes by tab-completion after `>`.** While the caret is on a line that begins with `>` and the user is typing the first word after it, pressing Tab completes against the available persona names. This is the one place the editor gains completion; it does not add general word-completion to the buffer.

3. **The query fires on Ctrl/Cmd+Enter, never on a plain Enter.** Plain Enter in the editor keeps its normal meaning (insert a newline), so a genuine Markdown blockquote line that happens to start with `>` is never consumed by accident. Ctrl+Enter / Cmd+Enter on a valid `> <persona> <prompt>` line sends the query. Ctrl/Cmd+Enter on a line that is not a valid request (no `>`, or a first word that is not a known persona) does nothing.

4. **The query is a single-shot ACP prompt, not the monitor batch cycle.** Each request spawns a fresh, one-prompt ACP session for the named persona using the existing ACP connection modules — the same harness-directive-to-subprocess mapping `spawnMonitorSession` (`src/monitor/acp.ts`) already performs, and the same tool-denial defaults. The session is primed with the persona body, the editor's current buffer content, and the request prompt; it is prompted exactly once; its single reply is parsed for hunks; then it is torn down. There is no 30-second flush, no accumulated context, and no persisted session.

5. **The persona sees the live buffer, including unsaved edits.** The content sent as context is the buffer as it currently stands in the editor client at the moment Ctrl/Cmd+Enter is pressed — the same live text the user is looking at, unsaved changes included — not the on-disk file. This mirrors how a monitor is fed the editor's live draft rather than disk (see `editor-tab.md` "Live draft sync" and `monitoring.md`).

6. **The persona may propose one or more hunks anywhere in the file.** A reply is not limited to editing the request line's location. The persona returns a list of edit hunks, each identifying the text to replace and its replacement, so a single request can rewrite a distant paragraph, insert in several places, or make no change at all. Each hunk is applied or dismissed independently.

7. **Hunks are resolved one at a time with `a` / `d`, per focused hunk.** When a reply yields multiple hunks, one hunk is focused at a time; pressing `a` accepts (applies) the focused hunk and `d` declines (dismisses) it, after which focus advances to the next pending hunk until none remain. Each pending hunk is titled `(A)ccept or (D)ecline this change?`. While any hunk is pending, `a` and `d` resolve the focused hunk rather than being typed into the buffer; all other keys are suppressed from editing the buffer until the pending set is resolved.

8. **Only one request is pending at a time per editor tab.** Firing a new request while a suggestion is still pending is ignored until the current one is fully resolved (every hunk accepted or declined). A pending suggestion is preserved when the user switches away from the tab and back.

9. **The `>` request line is removed only if a hunk is accepted.** If at least one hunk from the reply is accepted, the originating `> <persona> <prompt>` line is deleted from the buffer once the pending set is resolved. If every hunk is declined, the request line is left in place so the user can adjust the prompt and re-fire.

10. **Failures and empty replies notify, and keep the request line.** An unknown/unavailable persona, an ACP or query error, and a successful reply that proposes no edit each post a notification to the notifications tab (`notify` in `src/notifications.ts`), naming the persona (e.g. `<persona>: no suggestion` for the empty case). In all of these the request line is left untouched, and nothing is inserted into the buffer.

11. **Nothing about the suggestion is persisted.** Like the rest of an editor tab's state, a pending suggestion is in-memory only and is not saved or restored on `--relaunch`.

## What already exists (reuse, don't rebuild)

| Concern | Existing mechanism to reuse |
| --- | --- |
| Persona loading and listing | `loadPersona` and `listPersonas` in `src/personas.ts` — the same persona files `monitor` uses. |
| Spawning a persona's ACP session from its harness directive | `spawnMonitorSession` (`src/monitor/acp.ts`) and `connectAcp` (`src/acp/index.js`), including default tool denial. |
| Parsing a persona reply into deliverables | The marker-capture approach in `src/monitor/reply-format.ts` (`captureMarker`, `SUGGESTION_FORMAT`) — the model to follow for a new hunk-reply format. |
| The editor buffer, keyboard dispatch, and caret | `web/src/EditorTab.tsx`, `web/src/editor/useEditor.ts`, and the key-action layer (`web/src/editor/keys.ts`, `actionForKey`). |
| Live buffer content on the client | The editor's in-memory buffer (`toText` over the editor state) and its server-side draft (`editorSync` RPC, `tab.editorDraft`). |
| Posting a notification | `notify` / notification event plumbing in `src/notifications.ts` and `src/notifications-tab.ts`. |
| RPC surface | `src/protocol.ts` client-request union (e.g. `editorSync`, `complete`) — the place to add the new request. |

## Proposed changes

### Server: a single-shot editor-suggestion query

Add a client→server request (e.g. `editorSuggest`) to `src/protocol.ts` carrying the target editor's identifier, the persona name, the current buffer content, and the prompt text. Its handler validates the persona against `listPersonas`; on an unknown name it posts a notification (Decision 10) and returns a no-hunks result. On a known persona it loads it with `loadPersona`, spawns a one-prompt ACP session via the existing `spawnMonitorSession` path, primes the session with the persona body plus a new output-format instruction (below) and the buffer content wrapped as data, sends the prompt once, awaits the single reply, tears the session down, and returns the parsed hunks to the client. Any spawn or prompt error is reported via `notify` and returns no hunks.

Keep this handler in a new small module under `src/` (mirroring the `src/monitor/` layout, e.g. a `src/editor-suggest/` folder) rather than growing `src/monitor/manager.ts`, to respect the 200-line file cap and keep the single-shot flow separate from the monitor lifecycle.

### Server: a hunk reply format and parser

Add an editor-suggestion reply format alongside `src/monitor/reply-format.ts`'s `SUGGESTION_FORMAT`, instructing the persona to return zero or more edit hunks, each delimited by marker lines that give an **anchor** (the exact existing text to replace) and its **replacement** — anchor-based rather than line-numbered, so a hunk still resolves if the buffer shifts. Provide a parser (in the new module, following `captureMarker`'s style) that returns an ordered list of `{ anchor, replacement }` hunks, and an empty list when the reply proposes nothing. Define the contract for an insertion (empty anchor at a stated position) and for a pure deletion (empty replacement) in prose in the format string.

### Client: request detection and persona completion in the editor

In the editor client, add a pure helper that, given the current line text, decides whether it is a valid `> <persona> <prompt>` request and extracts the persona and prompt (validated against the persona list the client holds). Expose the persona list to the client either by reusing the existing `complete` RPC path or by a small dedicated list request; the editor uses it both to validate a request line and to drive Tab-completion of the persona name after `>` (Decision 2), rendered as an inline completion consistent with the command bar's ghost/completion styling.

### Client: firing the query and rendering pending hunks

Extend the editor's key handling (`EditorTab.tsx` / `web/src/editor/keys.ts`) so Ctrl/Cmd+Enter on a valid request line issues the `editorSuggest` request with the current buffer text (`toText`), the persona, and the prompt, and marks the tab as having a pending suggestion (blocking a second request per Decision 8). When the reply's hunks arrive, resolve each anchor against the current buffer to a concrete range and render the hunks as inline pending changes — each showing the proposed replacement and the title `(A)ccept or (D)ecline this change?`, with one focused at a time. While hunks are pending, route `a` to accept-focused and `d` to decline-focused (advancing focus), and suppress other buffer edits until the set is resolved. Accepting applies the hunk's replacement to the buffer through the existing editor mutation path; declining drops it. After the set resolves, delete the `>` request line iff at least one hunk was accepted (Decision 9). Keep the pending state in the persistently-mounted `EditorTab` so it survives tab switches (Decision 8), and never persist it (Decision 11).

### Specs

Add an "In-editor persona suggestions" section to `product/specs/editor-tab.md` describing the `>`-led request syntax, persona Tab-completion, the Ctrl/Cmd+Enter trigger, single-shot querying with the live buffer as context, per-hunk `a`/`d` resolution with the `(A)ccept or (D)ecline this change?` title, the request-line removal rule, the one-pending-at-a-time rule, and the notification behavior for failures and empty replies. Add a one-line cross-reference from `product/specs/monitoring.md` distinguishing this inline single-shot flow from a monitor's batched reporting-tab suggestions, and note in `monitoring.md`/`editor-tab.md` that both consume the live buffer.

## Tests

- **Server, reply-format/hunk parser** (new test beside `src/editor-suggest/`, mirroring `src/monitor/reply-format` test conventions): a reply with one hunk, multiple hunks, an insertion (empty anchor), a deletion (empty replacement), and a reply proposing no edit → empty list. Cover a malformed/partial marker block degrading to no hunk.
- **Server, request handler**: unknown persona → no hunks and a notification recorded; known persona happy path returns parsed hunks; a spawn/prompt error → no hunks and a notification. Use the existing monitor-session test seams (fake ACP session) so no real subprocess is spawned.
- **Client, request-line helper** (`web/src/…`, colocated `.test.ts`): valid `> <persona> <prompt>` parsed to persona+prompt; a `>` line whose first word is not a known persona → not a request; a plain blockquote line → not a request; leading whitespace before `>` handled.
- **Client, editor interaction** (`EditorTab.test.tsx` / a new colocated test): Ctrl/Cmd+Enter on a valid line issues the request; plain Enter does not; a second request while pending is ignored; `a` accepts the focused hunk and advances, `d` declines; the request line is removed only when a hunk was accepted and left when all declined; pending state survives a simulated tab switch. Follow the existing `useEditor`/`EditorTab` test setup.

## Out of scope

- **Monitor reporting-tab delivery of editor suggestions** — already shipped via `monitoring.md`'s editor-view target; unchanged here.
- **More than one pending request at a time** — deferred by Decision 8.
- **General word/identifier completion in the editor** — only persona-name completion after `>` is added (Decision 2).
- **Persisting or restoring a pending suggestion across `--relaunch`** — it stays transient (Decision 11).
- **Streaming/partial application of a hunk** — hunks arrive from a single reply and are applied whole.
- **Enabling filesystem/terminal or other tools for the query persona** — it inherits the monitor default of no tools (web tools only if the persona opts in, per `monitoring.md`), and this plan does not extend that.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` after each step (lints changed files, typechecks affected projects, runs server and web tests for the touched areas).
- Manual end-to-end: open an editor tab on a Markdown file, type `> ` and confirm Tab completes an available persona name; complete a request like `> summarizer rewrite the first paragraph`, press Ctrl/Cmd+Enter, and confirm a pending change appears titled `(A)ccept or (D)ecline this change?`. Press `a` and confirm the buffer changes and the `>` line is removed; repeat, pressing `d` on every hunk, and confirm the buffer is unchanged and the `>` line remains. Fire a request naming a non-existent persona and confirm a notification appears in the notifications tab with no buffer change. Fire a request the persona answers with no edit and confirm the `<persona>: no suggestion` notification appears and the request line stays.
