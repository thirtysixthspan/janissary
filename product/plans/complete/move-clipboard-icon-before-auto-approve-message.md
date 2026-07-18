# Move the clipboard icon before the auto-approve notification message, and use the regular icon style

**Complexity: 2/10** — reorder two sibling JSX elements and swap one icon import from solid to regular (the regular icon package is already a dependency after the unread-badge-flag-icon fix).

## Goal

In the transcript's "message" line rendering (`web/src/transcript-line.tsx`), a notification carrying an `openFile` path (in practice always the auto-approve harness notification, "Auto-approved a permission prompt") renders its clickable clipboard-icon affordance (`OpenFileLink`) **after** the message text. Per the backlog request:

1. Move the clipboard icon so it renders **before** the message text instead of after.
2. Use the Font Awesome **regular** (outline) clipboard icon instead of the current solid one.

## Approach

`renderLine`'s `message` branch (`web/src/transcript-line.tsx:182-197`) renders `message-time`, `message-tab`, then conditionally `message-text`, then conditionally `OpenFileLink`. Swap the order of the last two conditional renders so `OpenFileLink` comes before `message-text`.

`OpenFileLink` uses `viewCaptureIcon` (currently `faClipboard` from `@fortawesome/free-solid-svg-icons`, exported from `web/src/icons.ts`). Since `@fortawesome/free-regular-svg-icons` is already a project dependency (added for the unread-badge flag icon), re-export `viewCaptureIcon` from the regular package instead of the solid one — no new dependency needed.

`OpenFileLink`'s only consumer is this one call site, and `openFile` is only ever set by the `auto-approve` notification path (`src/harness/manager.ts:198-201`), so no conditional logic is needed to scope the reorder to "the auto-approve message" specifically — every message that renders `OpenFileLink` today is an auto-approve notification.

## Implementation steps

1. `web/src/icons.ts` — move `viewCaptureIcon` out of the solid-icons re-export block and into a `faClipboard as viewCaptureIcon` re-export from `@fortawesome/free-regular-svg-icons` (mirroring how `unreadIcon` was split out for the flag icon).
2. `web/src/transcript-line.tsx:192-196` — reorder the `message` branch's children so `{line.openFile && <OpenFileLink .../>}` renders immediately after `message-tab` and before `{line.text && <span className="message-text">...}`. Also remove the leading `{' '}` inside `OpenFileLink` (currently a leading space before the icon, appropriate when trailing the text; once leading, a trailing space before the message text reads better) — replace it with a trailing space after the icon inside `OpenFileLink`, so there is still a visual gap between the icon and the text that follows it.

## Tests

`web/src/transcript-line.test.tsx`'s existing `describe('renderLine — message openFile link', ...)` block already covers the link's presence, click behavior, aria-label, and icon glyph (`svg[data-icon]` currently asserted as `'clipboard'` — the regular package uses the same `iconName`, `clipboard`, so that assertion is unaffected). Add one new test case verifying render order:

```ts
it('renders the capture link before the message text', () => {
  const line: BufferLine = { type: 'message', text: 'Auto-approved a permission prompt', from: '8:32pm claude', openFile: '/captures/claude-now.txt' };
  const { container } = render(<>{renderLine(line, 0, clientStub, noop, vi.fn())}</>);
  const lineEl = container.querySelector('.line.message')!;
  const link = lineEl.querySelector('.file-link');
  const messageText = lineEl.querySelector('.message-text');
  expect(link).toBeInTheDocument();
  expect(messageText).toBeInTheDocument();
  expect(link!.compareDocumentPosition(messageText!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

Run `./scripts/run.mjs check-diff` after implementing.

## Spec updates

- `product/specs/harness.md:138-139` describes: "the app also saves the harness's on-screen text to a file and attaches a clickable clipboard-icon link to that same notification line; clicking the link opens the captured text...". Update to say the link is attached **before** the notification text, mentioning the regular/outline clipboard icon style, so the spec matches the new placement and glyph.

## Docs

- Checked `help.md` and `documentation/user-documentation/` for any mention of the auto-approve capture icon's position — none found. No documentation update needed.

## Out of scope

- Any other consumer of `viewCaptureIcon` — there is only the one call site, so no other component is affected.
- The auto-approve notification's text or behavior — only the icon's position and style change.
