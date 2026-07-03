# Close named tab

**Complexity: 3/10** — extends the existing `close` command parser and run method with a one-word name target and a tab lookup; no new RPCs, no protocol changes, no web-side work, no persistence.

## Goal

`close <tabname>` closes the tab with that label, without needing to switch to it first. `close` and `exit` already close the active tab; `close page <n>` already closes a specific page tab by number. This fills the remaining gap: close any tab by its visible name.

The label is the internal unique name used everywhere — `msg`/`broadcast` routing, the tab strip, monitor targets. Closing by label is the natural target.

## Design decisions

**Extend `parseClose`, don't replace it.** The parser already handles bare `close` (active tab) and `close page <n>` (page tab by number). Add a third target: `{ target: 'tabname', name: string }` for everything else.

**Parse order: empty → `page N` → tab name.** If the text after `close`/`exit` is empty, the target is the active tab (unchanged). If it matches `page <n>`, it's the existing page-tab path (unchanged). Everything else is treated as a tab name. This means `close page` (no number) now tries to close a tab literally named `page` instead of showing a usage error — a harmless corner case that aligns with the feature.

**Lookup by exact label match (case-insensitive).** Tab labels are always lowercase, but the user might type them with capital letters. Case-insensitive lookup matches existing tab conventions (label comparison is always case-insensitive throughout the codebase). If no tab matches, an error is appended to the transcript.

**No guard against closing self.** `close <current tab's label>` closes the active tab — same as bare `close`. No special-casing needed; the last-tab-exit behavior already applies.

**No protocol, web, or persistence changes.** The command runs entirely on the server. The `Tab.closeTab(index)` method already exists and handles resource cleanup, renumbering, and the last-tab-exit case. No new RPC, no new client code, no new state to save.

## Implementation steps

### 1. Extend `ParsedClose` type and `parseClose` parser

`src/commands/close.ts`:

- Add `{ target: 'tabname'; name: string }` to `ParsedClose`.
- After the empty-rest check and the `page <n>` regex, capture the remaining non-empty rest as a tab name target. Trim it, lowercase it for the match key.
- Remove the catch-all error return since everything non-empty and non-page is now a valid tab name attempt. Keep the error for `page` without a number — or better: when rest is just `page` with no number, treat it as a tab name (consistent — a tab could be named "page").

### 2. Extend `command.run`

`src/commands/close.ts`:

Add a case for `parsed.target === 'tabname'`:

- Find the tab by label with `managers.tab.tabs.findIndex((t) => t.label.toLowerCase() === parsed.name.toLowerCase())`.
- If not found, append an error: `No tab named "${parsed.name}".`
- Otherwise, `managers.tab.closeTab(index)`.

### 3. Tests

`src/commands/close.test.ts`:

- `parseClose` tests: `close <name>` returns `{ target: 'tabname', name: '<name>' }`; `exit <name>` (alias); bare word after `close` is treated as a tab name, not an error; `close page 3` still routes to `page` target (no regression).
- `run` tests (mock-based, mirroring the existing `controller.test.ts` style):
  - `close janus` calls `closeTab` with the correct index.
  - `close nonexistent` appends an error message without calling `closeTab`.
  - Case-insensitive match: `close JANUS` matches the `janus` tab.

## Out of scope / explicitly unchanged

- No fuzzy matching, no partial-name matching — exact label only.
- No close-by-title (display alias). The title is for display only; routing uses the label. If a user sets a display alias, they close by the original label, not the alias.
- No change to `close page <n>` behavior.
- No change to the save-before-close guard — it already applies to all close paths through `TabManager.closeTab`.
- No change to `quit` command behavior.

## Verification

`./scripts/run.mjs check-diff` after each step. No manual verification needed beyond CI passing.
