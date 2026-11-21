# Render no Markdown anywhere in a connection tab

**Complexity: 3/10** — ~5 added production lines across 3 production files, 4 behavioral requirements, 7 test scenarios (p=4.47)

## Goal

A connection tab still renders one section from Markdown: the preamble. The reviewer wants no Markdown rendered anywhere in the connection tab. Every section — preamble, message, thought, tool, plan, and permission — should show the characters the agent or user actually wrote, with the existing JSON pretty-printing and inline tool-call parsing kept as the only special presentations. Because no rendered Markdown means no links in the tab, the tab should no longer route clicked links through `openLink`.

## Approach

`ConnectionHistory` has a single `renderMarkdown` call left, in `Preamble`. Render the preamble string verbatim in `div.connections-preamble`, keeping the collapsed `<details>` wrapper and its label so the section's structure and toggle behavior stay identical. With that, no code in the tab produces an anchor, so drop the `openLink` prop from `ConnectionHistory`, its container click handler, and the argument passed from `ConnectionTab`. The `preserveJanissaryFences` helper existed only to keep fences visible through the Markdown renderer; with no Markdown path left it becomes dead code, so remove it and its colocated test. No server, record, wire, or CSS change is needed — `connections.css` already gives `.connections-preamble` the same `pre-wrap` treatment as the other text sections.

## Implementation steps

1. `web/src/plugins/connections/ConnectionHistory.tsx`: remove the `renderMarkdown` and `preserveJanissaryFences` imports; remove the `openLink` prop and the `handleClick` handler from `ConnectionHistory`; render `ConnectionHistory`'s content in a plain `div.connections-history-content`; change `Preamble` to render `{preamble}` verbatim inside `div.connections-preamble` and drop its `html` computation.
2. `web/src/plugins/connections/ConnectionTab.tsx`: pass only `window` to `ConnectionHistory`, removing the `openLink` argument.
3. Delete `web/src/plugins/connections/janissary-fences.ts` and `web/src/plugins/connections/janissary-fences.test.ts` — their only consumer was the removed Markdown path.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx`:
  - a preamble containing `**bold**`, a list, and a fenced command renders verbatim with no `strong`, `li`, or `pre` elements;
  - a preamble with a backtick `janissary` fence and one with a tilde `janissary` fence both keep every fence line as written;
  - a preamble containing a web link produces no anchor and a click on the preamble does not call `openLink`;
  - a message section with Markdown stays literal (existing coverage retained);
  - a message that is a whole JSON object still renders as indented JSON (existing coverage retained);
  - the preamble still opens first in a collapsed section, the query stays expanded, and a collapse survives a streamed update (existing coverage retained).
- Remove the two tests that asserted preamble links route through `openLink`; keep the `setup` mock harmless if no test reads it.

## Spec and documentation

- `product/specs/connections-tab.md`: state that no section renders from Markdown — the preamble reads exactly as recorded like every other entry — and remove the claims that the preamble renders as Markdown, that its `janissary` fences need preserving, and that its links open as page tabs.
- `product/specs/embedded-web-page.md`: drop the connection-tab clause from the web-link entry-point statement, leaving the shell-tab command-reply path.
- `help/connections.md` and `documentation/user-documentation/command-bar/connections.md`: replace the preamble-Markdown and link wording with plain-text wording and keep the collapse, JSON, and tool-call descriptions.

## Out of scope

- Server-side activity capture, the stored record shape, and the wire payload.
- The shared Markdown renderer, `openLink` capability, and Markdown rendering on other surfaces such as shell-tab answers and page tabs.
- JSON pretty-printing, inline tool-call rendering, section labels, order, collapse defaults, scrolling, and CSS.
- New commands, tabs, fields, or sections.

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step, after the tests, and over the complete change set. Never run `npm run check`.
