# Close tool sections by default in the connection tab

**Complexity: 1/10** — one attribute removed in 1 production file, 1 requirement and 3 test scenarios, no new units (p=3.03)

## Goal

In an ACP connection tab each prompt block presents its content as sections: the one-time preamble, the query, the activity entries (message, thought, tool, plan, permission), and the captured replies and final answer are not shown. Today the preamble and thought sections start collapsed, while the query stays expanded and message entries render as always-visible text. Tool sections, however, carry the `open` attribute and start expanded, so a reader opening a record sees every verbose tool command and reply unrolled. The tool and thought sections should both start collapsed by default, matching the preamble, while the query and message sections stay expanded and visible.

## Approach

A tool command and its reply already share one `<details className="connections-activity">` section with a `tool` summary, styled by the same rules as the other collapsible sections. Its expanded default comes solely from the `open` attribute on that element. Drop the `open` attribute so the section starts collapsed, the same way the thought section (which has no `open`) already does. No data model, wire payload, or rendering-path change is needed: the command and reply parts, their labels, and their content stay exactly as they are, only hidden until the reader expands the section. A reader's expand or collapse choice continues to survive streamed updates because the section's React identity is unchanged.

## Implementation steps

1. `web/src/plugins/connections/ConnectionHistory.tsx`: in the `groupToolEntries` mapping's tool branch, remove the `open` attribute from the `<details className="connections-activity" ... open>` element so the tool section starts collapsed. Leave the `key`, summary, and both command/reply parts untouched.
2. No CSS change: `.connections-activity` and `.connections-activity summary` already style a collapsed tool section identically to the collapsed thought and preamble sections.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx` (existing — adjust the tool default assertions and keep toggle-survival coverage):
  - the "shows captured owner, started time and ordered labels" case: the tool section's `details` no longer has the `open` attribute, while the thought section still does not and the query section still does;
  - the "groups a tool command and its reply into one labelled collapsible section" case: the grouped tool `details` starts without the `open` attribute, with both `command` and `reply` parts intact inside it;
  - the two "keeps a tool ... through a streamed update" cases: open the section first (set `open = true`) and assert it stays open after the rerender, so a reader's expansion still survives rather than only checking an already-collapsed default.
- Mirror the existing fake-record helper and assertion style; no new test file.

## Spec and documentation

- `product/specs/connections-tab.md`: change the connection-tab paragraph's statement that tool entries start expanded so it says tool entries start collapsed, alongside thought entries, with the query and messages remaining expanded.
- `documentation/user-documentation/command-bar/connections.md`: make the same change in the connection-tabs section's description of section defaults.
- No `help/` change: no command, flag, or key binding changes.

## Out of scope

- The stored record shape, wire payload, schema version, and all server-side capture of activity.
- The preamble, query, thought, and message sections' defaults, which already match the requested behavior.
- The tool command/reply grouping logic, their labels, text formatting, JSON pretty-printing, and inline `<function_calls>` rendering.
- The captured replies and final answer, which the connection tab does not show.

## Verification

`$janissary/scripts/run.mjs check-diff` after the implementation step, after the test changes, after the spec and documentation edits, and over the complete change set.
