# Render connection-tab message entries as plain text

**Complexity: 2/10** — ~2 added production lines in 1 production file, 5 behavioral requirements, 6 test scenarios (p=4.10)

## Goal

In an ACP or agent connection tab, every activity entry currently reads exactly as recorded except a `message` entry, which this pull request changed to render from Markdown. A reviewer asked that message entries render as text instead: headings, emphasis, lists, links, and fenced code should show the characters the agent actually wrote, on every streamed update. Preamble Markdown rendering, JSON pretty-printing, inline tool-call parsing, and the rest of the connection tab stay as they are.

## Approach

`ConnectionHistory` already has an `ActivityText` renderer that shows a message verbatim while preserving the two special presentations this tab promises: a whole JSON object is pretty-printed, and inline `<function_calls>` blocks become labelled call blocks. The `MessageText` renderer added by this pull request is the only thing that routes `message` entries through `renderMarkdown` and `preserveJanissaryFences`. Delete `MessageText` and render every non-tool entry — `message` included — through `ActivityText`. The preamble keeps its own Markdown path, so both imports remain used and the tab's click handler still routes links in the rendered preamble through `openLink`. No server, record, wire, or CSS change is needed.

## Implementation steps

1. `web/src/plugins/connections/ConnectionHistory.tsx`: delete the `MessageText` component and change the non-tool activity branch so every entry's `content` is `<ActivityText text={entry.text} />`; leave `Preamble` and its imports untouched.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx`:
  - a `message` entry with Markdown (`**bold**`, a list, inline code) renders as literal text, as a `thought` entry with the same text already does;
  - a `message` entry containing a `janissary` fence keeps its fence lines and command verbatim, with no Markdown-generated `<strong>`, `<code>`, or `<pre>`;
  - a `message` entry containing a web link produces no anchor and does not call `openLink`, while a link in the rendered preamble still routes through `openLink` — cover the preamble case to retain the click-handler check that the message case no longer exercises;
  - a `message` whose whole text is a JSON object still renders as indented JSON (existing case retained);
  - a streamed update re-renders the `message` section as its new literal text;
  - an agent record in each terminal status renders a `message` containing `<b>plain</b>` literally rather than as bold markup.
- Mirror the existing `setup`/`record` helpers and assertion style; no new test file.

## Spec and documentation

- `product/specs/connections-tab.md`: state that a `message` section reads exactly as recorded instead of rendering from Markdown, and drop the claims that its Markdown is formatted, that its links open as page tabs, and that its `janissary` fences need special handling to stay literal; keep the JSON, tool-call, and preamble-Markdown statements.
- `help/connections.md`: replace the "message renders as Markdown" wording with plain-text wording, keep the JSON and tool-call exceptions, and narrow the link sentence to the rendered preamble.
- `documentation/user-documentation/command-bar/connections.md`: make the same plain-text adjustment in its connection-tabs section while keeping the preamble, JSON, and tool-call wording.

## Out of scope

- Server-side activity capture, the stored record shape, and the wire payload.
- Preamble Markdown rendering, link opening in the preamble, JSON pretty-printing, inline tool-call rendering, and every other activity kind's text and labels.
- The Markdown renderer itself and the step/batch tool-loop logic from the pull request under review.
- New commands, tabs, fields, sections, or CSS.

## Verification

`$janissary/scripts/run.mjs check-diff` after the implementation step, after the tests, and over the complete change set. Never run `npm run check`.
