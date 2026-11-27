# test: add colocated tests for the two-state MCP metadata flag

**Complexity: 2/10** — no production lines or files (tests only), 5 requirements and 5 scenarios (p=3.50)

## Goal

The MCP metadata flag already derives a plain `mcp` state from a tab launched with MCP config and swaps to `mcpInUse` once the harness first calls the server, and the metadata row already renders those as a plain and a green server glyph. Neither state has a colocated test, even though every analogous flag does, so a wrong tooltip string, a missing green highlight, or a regression in the plain-to-in-use derivation could ship unnoticed. The goal is to close that technical debt by pinning both states in the two existing colocated test files, without changing production code or any existing test.

## Requirements

1. "a harness tab with `mcp` set and no `mcpUsed` reports `mcp`": a harness tab whose `mcp` is set and whose harness has no `mcpUsed` carries only `mcp` in its view `flags`.
2. "one with `mcpUsed` set reports `mcpInUse` in its place": a harness tab whose `mcp` is set and whose harness has `mcpUsed` set carries `mcpInUse` in `flags` and no longer carries `mcp`.
3. "a tab without `mcp` reports neither even when `mcpUsed` is set": a tab whose `mcp` is unset carries neither `mcp` nor `mcpInUse` in `flags`, even when its harness has `mcpUsed` set.
4. "`flags={['mcp']}` renders a server glyph with accessible name and title \"MCP server\" and no `tab-flag--active`": `HarnessTabMeta` renders one `role="img"` named "MCP server" with that title, a `svg[data-icon="server"]`, and without the `tab-flag--active` class.
5. "`flags={['mcpInUse']}` renders the same glyph with name and title \"MCP server in use\" and the `tab-flag--active` class": `HarnessTabMeta` renders one `role="img"` named "MCP server in use" with that title, the same server glyph, and with `tab-flag--active`.

## Design decisions

- Add the cases to the two files that already sit beside the code they cover — `src/tab/view.test.ts` and `web/src/harness/HarnessTabMeta.test.tsx` — rather than creating a new test module. Both files already colocate coverage for every other flag.
- Mirror the neighboring browser-flag cases in each file: the same `describe`/`it` shape, the same `flagsOf` helper and harness-tab factory in the server test, and the same `getByRole('img', …)` plus `title`, `data-icon` and `tab-flag` assertions in the component test. The two MCP states use the existing `server` glyph, so the new cases assert `svg[data-icon="server"]` as the browser cases assert `svg[data-icon="globe"]`.
- Pin the two states exactly as the spec describes them: the plain state is tied to the tab's `mcp` launch fact, the green state to the harness's sticky `mcpUsed` mark, and a tab without `mcp` shows neither even if `mcpUsed` is somehow set. No derivation is inferred from a plugin id or from the harness's view discriminant.
- Change no production code and no existing test. The spec already documents both looks, so the work is verification only; editing the mapping, the display table, or the neighboring cases would widen scope without adding coverage.

## Preserved behavior

1. A `-b` tab still reports `browser` before use and `browserInUse` once a browser starts, and reports neither for a tab not launched with `-b`. The MCP cases must not alter that derivation. Pinned by `is never reported for a tab not launched with -b` in `src/tab/view.test.ts`.
2. The browser and browser-in-use glyphs keep their globe icon, their accessible names and titles, and their active-class states. Pinned by `renders the browser-in-use flag as the same globe, marked active for its green highlight` in `web/src/harness/HarnessTabMeta.test.tsx`.

## Assumptions

1. The server derivation is `src/tab/view.ts:262-265` `function mcpFlag(tab: Tab): string[]` with `return tab.harness?.mcpUsed ? ['mcpInUse'] : ['mcp'];` and `if (!tab.mcp) return [];`, called from `tabFlags` at `src/tab/view.ts:231` `...mcpFlag(tab),`.
2. The launch fact is `src/tab/types.ts:446` `mcp?: boolean;` and the sticky first-use mark is `src/tab/types.ts:91` `mcpUsed?: boolean;`, so a harness-tab fixture only needs `mcp` set and a harness payload to exercise both states.
3. The display table is `web/src/shared/tab/flag-display.ts:30-31` `mcp: { icon: mcpIcon, label: 'MCP server' },` and `mcpInUse: { icon: mcpIcon, label: 'MCP server in use', className: 'tab-flag--active' },`; `mcpIcon` is `faServer` (`web/src/shared/icons.ts:10`), so the rendered glyph is `svg[data-icon="server"]`.
4. `HarnessTabMeta` renders every flag as `<span className={…} role="img" aria-label={display.label} title={display.label}>` (`web/src/harness/HarnessTabMeta.tsx:78`), which is what the component assertions read.
5. The behavior is already specified at `product/specs/tabs.md:214-219` ("The MCP flag has two looks …"), including the green `tab-flag--active` styling and the "no MCP flag at all" case, so no spec wording is missing.

## Existing functionality

1. `mcpFlag(tab)` in `src/tab/view.ts:262` already derives the two states from `tab.mcp` and `tab.harness?.mcpUsed`; the new tests only observe it.
2. The `flagsOf` helper and harness-tab factory in `describe('while a browser is in use')` at `src/tab/view.test.ts:359-367` are the pattern the MCP cases reuse.
3. The `tabFlagDisplay` entries for `mcp` and `mcpInUse` at `web/src/shared/tab/flag-display.ts:30-31` already supply the glyph, labels, and green class the component tests assert.
4. The browser-flag display cases at `web/src/harness/HarnessTabMeta.test.tsx:240-255` provide the exact assertion style for the two new component cases.

## Implementation steps

1. In `src/tab/view.test.ts`, immediately after the `describe('while a browser is in use')` block, add a `describe` block for the MCP flag with a local `flagsOf` helper and a harness-tab factory that sets `tab.mcp = true` and a running harness payload. Add the three cases from Requirements 1-3, asserting the full `flags` array so a stray extra flag fails too. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `web/src/harness/HarnessTabMeta.test.tsx`, immediately after the two browser-flag display cases and before the three-icon-order case, add the two cases from Requirements 4-5 using `getByRole('img', { name: … })`, `toHaveAttribute('title', …)`, a `svg[data-icon="server"]` query, and the `tab-flag` / `tab-flag--active` class assertions. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Leave `src/tab/view.ts`, `web/src/shared/tab/flag-display.ts`, and every existing test byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change adds no user-visible surface: it pins the glyph, tooltip, and green active state that the metadata row already renders for the two MCP flags.

## Tests

In `src/tab/view.test.ts`, colocated beside the browser-flag cases:

1. Requirement 1: a harness tab with `mcp` set and no `mcpUsed` reports exactly `['mcp']`.
2. Requirement 2: the same tab with `harness.mcpUsed` set reports exactly `['mcpInUse']`, with `mcp` absent.
3. Requirement 3: a tab without `mcp` reports `[]` even when `harness.mcpUsed` is set.

In `web/src/harness/HarnessTabMeta.test.tsx`, colocated beside the browser-flag display cases:

4. Requirement 4: `flags={['mcp']}` yields a `role="img"` named and titled "MCP server", a `svg[data-icon="server"]`, and no `tab-flag--active`.
5. Requirement 5: `flags={['mcpInUse']}` yields the same glyph named and titled "MCP server in use" with `tab-flag--active`.

## Out of scope

- Changing the production `mcpFlag` derivation, the `tabFlagDisplay` table, the `mcp`/`mcpUsed` types, or the protocol flag comment.
- Editing, moving, or renaming any existing test case, including the browser-flag and three-icon-order cases.
- Spec or help edits: the two MCP looks are already described in `product/specs/tabs.md`, and no command, flag, or key binding changes.
- User and developer documentation; the work is test coverage only.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes, including the server and web test projects.
2. Manual reading check: read the new MCP block in `src/tab/view.test.ts` and confirm the three cases assert `['mcp']`, `['mcpInUse']` in place of `mcp`, and `[]` for a tab without `mcp`; read the new cases in `web/src/harness/HarnessTabMeta.test.tsx` and confirm the plain server glyph is titled "MCP server" without `tab-flag--active` and the in-use one is titled "MCP server in use" with it. Finally read `src/tab/view.ts` and `web/src/shared/tab/flag-display.ts` and confirm the production mapping and display table are unchanged. A failure looks like an assertion on a missing or wrongly styled glyph, or any unexpected diff outside the two test files.
