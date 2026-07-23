# Editor suggest incremental priming

**Complexity: 2/10** — a small, localized change to one function and one manager method; no new
subsystem, protocol shape, or UI surface.

## Root cause

`product/plans/complete/editor-tab-persona-connections.md` made an in-editor persona's ACP session
persistent and multi-turn (`EditorAcpManager`, `src/editor/acp-manager.ts`), and its Decision 4
states the session "no longer needs the full persona body re-primed after the first turn." But the
call site that builds the prompt, `editorSuggest` in `src/editor-suggest/handler.ts`, was never
changed to act on that: it unconditionally joins `persona.body`, `HUNK_FORMAT`, and the delimited
buffer content into `primingText` on every single call, regardless of whether the tab's session for
that persona already exists. `EditorAcpManager` has no way to tell the caller whether a session was
just spawned or already existed, so the handler has no signal to prime conditionally even if it
wanted to.

## Correct behavior

The first suggestion request for a given persona in a given editor tab primes the session with the
full persona instructions and the hunk-reply format, exactly as today. Every later request to that
same persona in that same tab — as long as the session stays open — sends only the current buffer
content (wrapped in a fresh delimiter, since it can change between requests and the anti-injection
instruction travels with it) and the request text; it does not resend the persona body or the
hunk-format instructions, since the model already has them from the first turn and the ACP session
carries that context forward. If the session is later closed (explicit close or tab close) and a new
one is opened, priming starts over from the top, matching the described "first request opens a
connection ... which stays open for the rest of that tab's life" lifecycle in
`product/specs/editor-tab.md`'s "In-editor persona suggestions" section.

## Reproduction

Added a test to `src/editor-suggest/handler.test.ts` (`only the first request in a tab/persona
session primes with the persona body and hunk format; later requests send just the buffer and
prompt`) that fires two `editorSuggest` calls with `hasSession` mocked to reflect a session that
does not exist yet on the first call and does exist on the second. Against the buggy code both
prompts contained the persona body (`'Watch for bugs.'`) and the full `HUNK_FORMAT` instructions
verbatim — confirmed by running `npx vitest run src/editor-suggest/handler.test.ts`, which failed
with the second prompt containing the same ~500-character boilerplate block as the first. This
matches the captured real-world transcript in the bug report, where three consecutive requests on
the same file each repeat the full ~800-character "You are an editing assistant..." persona body
and hunk-format instructions verbatim.

## Approach

Give `EditorAcpManager` a cheap existence check, `hasSession(label, persona): boolean`, mirroring
its existing `key()` helper. In `editorSuggest`, capture `hasSession(label, persona.name)` *before*
calling `session()` (which lazily creates the entry) — that pre-call value is exactly "was this the
first request for this persona in this tab." Use it to decide whether to prepend `persona.body` and
`HUNK_FORMAT` to the prompt; the buffer-wrapping block (delimiter, anti-injection instruction,
content) and the `Request: ...` line are always sent, since the buffer can change on every request.

## Implementation steps

1. Add `hasSession(label: string, persona: string): boolean` to `EditorAcpManager`
   (`src/editor/acp-manager.ts`), reusing the existing `key()` helper.
2. In `src/editor-suggest/handler.ts`, read `managers.editorAcp.hasSession(label, persona.name)`
   before calling `managers.editorAcp.session(...)`, and use it to conditionally include
   `persona.body`/`HUNK_FORMAT` in the assembled prompt. Update the function's doc comment to
   describe the new incremental behavior.
3. Update `src/editor-suggest/handler.test.ts`'s mocked `Managers` shape (`makeManagers`) to include
   a default `hasSession` mock so the existing tests keep passing unchanged.
4. Add a unit test to `src/editor/acp-manager.test.ts` covering `hasSession`'s own behavior (false
   before a session exists, true after, false again after `close`/`closeTab`).

## Regression test

`src/editor-suggest/handler.test.ts` — "only the first request in a tab/persona session primes with
the persona body and hunk format; later requests send just the buffer and prompt." Written and
confirmed failing against the buggy code before the fix; will be re-run after the fix to confirm it
passes.

## Out of scope

- Any change to the interactive `acp` command's own db/browser/question primer behavior
  (`src/acp/manager.ts`) — that primer is a syntax reminder resent by design on every top-level
  prompt (per `product/specs/acp.md`), a different concern from an editor persona's one-time system
  instructions.
- Trimming or summarizing buffer content sent per request — every request still sends the full,
  current buffer content, since the file can change between requests and the persona needs to see
  its live state.
- Any change to session lifecycle, connection UI, or the connections window.
