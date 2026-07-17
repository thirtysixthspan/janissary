# Auto-approve capture link is an icon, not text

**Complexity: 1/10** — a one-line render change in an existing component, no data model or protocol changes.

## Goal

The "view capture" affordance that appears on auto-approve notification lines (rendered when a `message` transcript line carries an `openFile` path) currently renders as literal text: `view capture`. It should render as an icon instead, matching the rest of the app's icon-button convention (emoji glyph + `title` tooltip, e.g. `web/src/AgentTabMeta.tsx:38` `📁`, `:48` `➕`).

## Approach

- `web/src/transcript-line.tsx:92` (`OpenFileLink`) renders the clickable pill with the text `view capture` (`:100`). Replace the text content with a camera emoji (`📷`), matching the "capture" semantics.
- The element is a `<span role="link">`, not a `<button>` — keep that, since it sits inline inside a `.line.message` line (see `.line.message .file-link` pill styling in `web/src/theme.css:335-339`).
- Removing the visible text drops the element's accessible name, so add `aria-label="View capture"` alongside the existing `title="Open the captured screen in an editor tab"` tooltip, mirroring other icon buttons in the codebase that pair `title` + `aria-label` (e.g. `web/src/PageTab.tsx:19-20`, `web/src/TabItem.tsx:74-75`).
- No CSS changes needed — `.file-link` styling (border, padding, hover) applies equally to an emoji glyph.

## Implementation steps

1. `web/src/transcript-line.tsx` — in `OpenFileLink`, replace `{' '}view capture` with `{' '}📷` and add `aria-label="View capture"` to the `<span>`.

## Tests

- `web/src/transcript-line.test.tsx` — extend the `renderLine — message openFile link` describe block with a test asserting the link has `aria-label="View capture"` and that its text content no longer contains "view capture" (case-insensitive), so a regression back to a text label is caught.
- Existing test `renders a clickable link that sends an edit command when the message carries openFile` already selects by `.file-link[role="link"]`, not by text, so it keeps passing unchanged.

## Out of scope

- No changes to the notification/capture pipeline (`src/harness/manager.ts`, `src/notifications.ts`) — only the client-side rendering of the existing `openFile` affordance changes.
- No new icon library or icon component abstraction — this follows the existing inline-emoji convention used elsewhere in `web/src`.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks the affected project, and runs the related web tests.
- Manual: trigger an auto-approve notification (or inspect the transcript pane after one occurs) and confirm the notification line shows a camera icon instead of the text "view capture", that hovering shows the tooltip, and that clicking it still opens the captured file in an editor tab.
