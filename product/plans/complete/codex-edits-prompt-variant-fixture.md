# Add a regression fixture for the reported codex "make the following edits" prompt variant

**Complexity: 1/10** — a single new test fixture in an existing table-driven test file; no
production code changes.

## Goal

The backlog reported a codex file-edit approval prompt that should be auto-approved:

```
  Would you like to make the following edits?


› 1. Yes, proceed (y)
  2. Yes, and don't ask again for these files (a)
  3. No, and tell Codex what to do differently (esc)

  Press enter to confirm or esc to cancel
```

Verified against the current detector (`src/harness/codex-permission-gate.ts`), this exact text
already matches the existing "File changes" family (title `Would you like to make the following
edits?` at line 32, `firstOption` checking `startsWith('Yes, proceed')` at line 33) — `Yes, proceed
(y)` satisfies `startsWith('Yes, proceed')`, and `Press enter to confirm or esc to cancel` satisfies
`isConfirmCancelFooter`'s case-sensitive-but-substring `includes('to confirm')` /
`includes('to cancel')` checks (line 57-59). Confirmed directly: feeding this exact string to
`detectCodexPermissionGate` returns `true` on current `master`. So no detector or matcher change is
needed — the behavior the issue asks for already exists (added by the prior
`codex-harness-auto-approve-detection` plan).

What's missing is regression coverage for this specific shape: the existing `EDITS` fixture in
`src/harness/codex-permission-gate.test.ts:30-39` only covers a 2-option variant with no per-option
keyboard-shortcut suffixes (`(y)`, `(a)`, `(esc)`) and a different footer wording (`Press Enter to
confirm · Esc to cancel` vs. the reported `Press enter to confirm or esc to cancel`). Since this
specific rendering was explicitly reported, it should have a fixture locking it in, so a future
change to the matcher's assumptions (e.g. tightening the footer check) can't silently regress this
exact prompt without a test failing.

## Approach

Add one more fixture to the existing table-driven test alongside `COMMAND`, `NETWORK`, `EDITS`,
`PERMISSIONS`, and `MCP_ELICITATION` in `src/harness/codex-permission-gate.test.ts`, using the
reported prompt's exact text (3 options with keyboard-shortcut suffixes, the reported footer
wording), and register it in the `ALL_GATES` table so it runs through the existing positive-match
test loop.

## Implementation steps

1. In `src/harness/codex-permission-gate.test.ts`, add a new fixture constant `EDITS_WITH_SHORTCUTS`
   after `EDITS` (line 39), reproducing the reported prompt's exact lines (title, blank lines, the
   three numbered options with their `(y)`/`(a)`/`(esc)` suffixes, blank line, the `Press enter to
   confirm or esc to cancel` footer).
2. Add `EDITS_WITH_SHORTCUTS` to the `ALL_GATES` object (line 64) so it is picked up by the existing
   `for (const [name, text] of Object.entries(ALL_GATES))` positive-match loop (lines 67-71) — no new
   `it` block needed, matching the file's existing pattern for adding a positive fixture.

## Tests

The added fixture is exercised automatically by the existing table-driven loop
(`src/harness/codex-permission-gate.test.ts:66-71`), which asserts
`detectCodexPermissionGate(text)` is `true`. No new assertions or test blocks beyond registering the
fixture. Run `./scripts/run.mjs check-diff` to confirm it passes.

## Spec updates

None. `product/specs/harness.md`'s codex auto-approve section already documents the "File changes"
family in harness-neutral, behavior-level terms; this change adds test coverage only and alters no
user-visible behavior.

## Docs

- Checked `help.md` — no per-prompt-variant detail to update.
- Checked `documentation/user-documentation/` — no per-prompt-variant detail to update.

## Out of scope

- Any change to `src/harness/codex-permission-gate.ts`'s detection logic — the existing matcher
  already handles this prompt correctly.
- The other three newly-added backlog issues (file-navigator rename sync, rename input width,
  new-directory auto-rename) — separate fixes.
