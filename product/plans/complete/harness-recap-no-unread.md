# A trailing "recap:" line does not badge a hidden harness tab unread

**Complexity: 2/10** — one new pure text-matching helper next to `classifyClaudeScreen` in
`src/harness/busy-classify.ts`, plus one extra condition on the existing ready-commit call site in
`src/harness/busy-status.ts`. No new state, no new call sites, no architecture change.

## Goal

`busyStatusHandler` (`src/harness/busy-status.ts`) badges a hidden harness tab unread every time a
working→idle transition commits (the debounced `pendingReady` branch), regardless of what claude's
final visible output actually was. When claude closes a turn with a short `recap:`-prefixed summary
line rather than substantive new output, that transition should not badge the tab unread — a recap is
not new information worth interrupting the user for, unlike ordinary completions or a stuck permission
prompt.

## Approach

Add a pure helper, `endsWithRecap(text: string): boolean`, beside `classifyClaudeScreen` in
`src/harness/busy-classify.ts` — the same module that already parses claude's rendered screen into a
prompt-box/generating classification, so the "find the input prompt, look at what's above it" logic
lives in one place. The helper finds the input-caret line (the same `❯ ...` line, excluding the gate's
`❯ 1.` option, that `classifyClaudeScreen`'s `promptBox` check already locates), takes the last
non-blank line above it, and reports whether that line, trimmed, starts with `recap:` case-insensitively.

`busyStatusHandler`'s ready-commit branch in `src/harness/busy-status.ts` calls this helper only for
`name === 'claude'` (the recap convention and the prompt-box screen shape are claude-specific; codex
and opencode are unaffected) and skips `markUnread` when it returns true. The busy flag itself still
clears normally — only the unread badge is suppressed.

## Implementation steps

1. In `src/harness/busy-classify.ts`, extract the input-caret-line predicate already inlined in
   `classifyClaudeScreen`'s `promptBox` check into a small named helper (`isInputCaretLine`, mirroring
   the one already in `src/harness/auto-approve.ts`) so both `classifyClaudeScreen` and the new
   `endsWithRecap` can use it without duplicating the `❯`/`1.` logic.
2. Add `export function endsWithRecap(text: string): boolean` to `src/harness/busy-classify.ts`: split
   `text` into lines, find the first input-caret line via the shared helper, take the last non-blank
   line before it (or before the end of the text if no caret line is found), and return whether that
   line's trim matches `/^recap:/i`.
3. In `src/harness/busy-status.ts`'s `apply` function, change the ready-commit branch:
   ```ts
   if (pendingReady) {
     managers.tab.deleteBusy(label);
     if (name !== 'claude' || !endsWithRecap(capture.text)) managers.tab.markUnread(label);
   } else pendingReady = true;
   ```
4. Update the leading comment block in `busy-status.ts` to note the recap exception.
5. Run `./scripts/run.mjs check-diff`.

## Tests

Add to `src/harness/busy-classify.test.ts` (new `describe('endsWithRecap', ...)` block):
- Returns `true` when the last content line above the prompt box is `recap: did the thing` (matching
  `CLAUDE_PROMPT_BOX`-shaped fixtures already used in `busy-status.test.ts`).
- Returns `true` case-insensitively (`Recap:`, `RECAP:`).
- Returns `false` when the last content line does not start with `recap:` (ordinary completion text).
- Returns `false` for a generating frame (no prompt box present at all).

Add to `src/harness/busy-status.test.ts`'s `describe('busyStatusHandler debounce', ...)` and
`describe('busyStatusHandler state push', ...)` blocks:
- `'claude: does not badge the tab unread when the ready transition\'s last line is a recap'` — send a
  busy capture, then two ready captures whose screen text ends with a `recap: ...` line above the
  prompt box; assert `tab.markUnread` is not called (debounce case) / `tabs[0].hasUnread` stays `false`
  (state-push case), while `tab.deleteBusy` is still called.
- `'claude: still badges unread for an ordinary (non-recap) ready transition'` — regression check that
  the existing behavior is untouched when the last line does not start with `recap:`.
- Confirm codex/opencode ready transitions are unaffected by adding a recap-shaped last line to one of
  their fixtures and asserting `markUnread` still fires (the `name !== 'claude'` guard is a genuine
  behavior difference worth pinning).

## Spec updates

`product/specs/harness.md`, the "Busy/ready status" section (~line 279-282, the paragraph starting "Once
a hidden ... harness tab's working→idle transition commits, the tab is marked with the unread badge"):
add a sentence noting that a claude tab whose completed turn ends in a `recap:`-prefixed line is
exempted from this badge — the busy dot still clears, but the tab is not marked unread.

## Out of scope

- Any change to the busy/ready classification (`classifyBusy`) itself — a recap turn is still detected
  as "ready" exactly as before; only the unread badge is suppressed.
- Any change to the permission-gate unread call site (unaffected; a gate is never recap-shaped).
- codex/opencode: no recap convention exists for them today, so no exemption is added there.
- Any change to how `capture.text` is captured or throttled.

## Verification

- Run `./scripts/run.mjs check-diff` after the change and after the tests.
- Manual check: run a claude harness tab in the background, have it finish a turn whose last visible
  line is `recap: ...`, and confirm the tab does not pick up the unread badge, while an ordinary
  completion (or a stuck permission prompt) still does.
