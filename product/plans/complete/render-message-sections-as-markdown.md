# Render connection-tab message sections from Markdown as they arrive

**Complexity: 3/10** — ~20 added lines in 1 production file, 5 requirements, 6 scenarios, 1 new component (p=4.53)

## Goal

In an ACP connection tab, each activity entry appears as its own labelled section. The preamble is rendered from Markdown, but a `message` section — the agent's streamed text — is rendered as literal text, so its Markdown (headings, emphasis, lists, links, code) shows as raw markup or not at all. A reviewer of the multiple-tool-calls-per-reply change asked that each message section be rendered from Markdown as soon as the text is available, rather than waiting for a final answer to be rendered as a separate response. Render `message` activity sections from the same sanitized Markdown path the preamble uses, on every streaming update, while leaving the other section kinds and the special content handling unchanged.

## Approach

`ConnectionHistory` already renders the preamble through `renderMarkdown` and routes clicked links through the `openLink` capability via the history container's click handler. Add a `MessageText` renderer for `message` entries that uses that same Markdown path. Reuse the existing `parseToolCalls` and `prettyJson` handling first so a message that embeds `<function_calls>` blocks or a whole JSON object keeps its current labelled-call and indented-JSON presentation; only plain message text falls through to Markdown. When `renderMarkdown` returns no HTML, fall back to the verbatim text, matching the preamble's fallback. Because the connection tab's content key already includes the latest activity text, a streamed update re-renders the section with its current Markdown immediately, with no server, record, or wire change.

## Implementation steps

1. `web/src/plugins/connections/ConnectionHistory.tsx`: add a `MessageText` component that (a) delegates to the existing `ActivityText` when the text contains `<function_calls>` segments, (b) emits the existing `pre.connections-activity-json` when `prettyJson` succeeds, and (c) otherwise renders `renderMarkdown(text)` through `dangerouslySetInnerHTML` in a `div.connections-activity-text`, falling back to verbatim text when the HTML is `undefined`.
2. `web/src/plugins/connections/ConnectionHistory.tsx`: in the non-tool activity branch, pass a `message` entry's text through `MessageText` and leave every other entry kind on `ActivityText`.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx`:
  - a `message` entry with Markdown (`**bold**`, a list, a fenced code span) renders the formatted HTML while a `thought` entry with the same text stays literal;
  - a `message` entry whose Markdown parse yields no HTML falls back to the verbatim text;
  - a link in a rendered `message` section routes through `openLink` without navigating the window, reusing the existing click-routing path;
  - a `message` entry embedding `<function_calls>` still renders the labelled tool call and its prose plainly (existing coverage retained);
  - a `message` entry that is a whole JSON object still renders as indented JSON (existing coverage retained);
  - updating the latest activity text re-renders the `message` section from its new Markdown.
- Mirror the existing `setup`/`record` helpers and assertion style; no new test file.

## Spec and documentation

- `product/specs/connections-tab.md`: state that a `message` activity section renders its text from Markdown as it streams in, with a verbatim-text fallback, while the other activity kinds and inline tool-call and JSON handling stay as recorded.
- `documentation/user-documentation/command-bar/connections.md`: state in its connection-tabs section that message entries render as Markdown; keep the preamble and inline tool-call/JSON wording.
- `help/connections.md`: state in its connection-tab bullet that a `message` entry renders as Markdown as its text arrives except when it is JSON or carries tool calls, and that links in a rendered message open as a page tab. No command, flag, or key binding description changes.

## Out of scope

- Server-side activity capture, the stored record shape, and the wire payload; the text to render is already delivered to the tab.
- Preamble, query, thought, plan, permission, and tool section rendering, their labels, order, and collapse defaults.
- The Markdown renderer itself, link-opening behavior, and the step/batch tool-loop logic from the pull request under review.
- New commands, tabs, fields, or sections.

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step, after the tests, and over the complete change set. Never run `npm run check`.
