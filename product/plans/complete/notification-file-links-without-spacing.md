# Notification file links without spacing

Issue: remove the spacing between clipboard icons in notifications with multiple icons.

Complexity rating: 2/10

## Goal

A notification line that carries more than one file link (a folded run of repeats, for example seven auto-approved permission prompts) shows one clipboard icon per file. Each icon is its own item in the message row's flex layout, so the row's 8px column gap lands between every pair of icons, and each link also carries a trailing space. The icons should sit side by side as one tight group, while the group keeps its usual gap from the tab chip before it and the message text after it.

## Approach

In `web/src/shared/transcript/transcript-line.tsx`, render a message line's file links inside a single `message-files` span, so the row's flex gap applies around the group rather than between icons. Drop the trailing `{' '}` from `OpenFileLink`. In `web/src/theme.css`, style `.line.message .message-files` as an `inline-flex` group with no gap. Render no group at all when the line has no file links, so a plain notification keeps its existing layout.

## Implementation steps

1. In `transcript-line.tsx`, remove the trailing space from `OpenFileLink`, and wrap the `openFiles` links of a message line in `<span className="message-files">`, rendered only when `openFiles` is non-empty.
2. In `theme.css`, add a `.line.message .message-files` rule: `display: inline-flex; align-items: baseline;` with no gap.

## Tests

- `web/src/shared/transcript/transcript-line.test.tsx`: a folded line's links all sit inside one `.message-files` group, which is a direct child of the message line.
- Same file: a message with no `openFiles` renders no `.message-files` group.
- Same file: a link has no trailing whitespace text (its text content is empty).
- `web/src/theme.test.ts`: the `.line.message .message-files` rule is `inline-flex` and declares no gap.
- Existing file-link tests (click opens the file, icon is a clipboard, link precedes message text, one link per file) still pass.

## Out of scope

- The spacing between the time, tab chip, file-link group, and message text.
- Which files a notification carries, or how repeats fold.
- The clipboard icon in the metadata row and status panels.

## Specs and docs

- `product/specs/notifications.md` (Repeated notifications): the capture icons of a folded line sit together as one group with no space between them.
- `help.md` and `documentation/user-documentation/`: checked; neither describes the spacing of notification icons.
