# Permission-prompt (message-line) notification formatting

**Complexity: 3/10** — one shared render function plus CSS; the risk is scoping the CSS narrowly
enough not to touch the unrelated `.line.output .file-link` styling used for in-transcript file
links.

## Goal

Notification lines (`type: 'message'`, e.g. auto-approve notifications: `● 8:32pm claude: Auto-approved
a permission prompt`) currently color the **entire line** — dot, timestamp, tab name, message
text, and the "view capture" link — with the notifying tab's dot color, via one inline
`style={{ color: line.fromColor }}` on the whole line `<div>`.

Change this so:
- Only the `● <time> <tab>` portion (the dot + timestamp + tab name) is colored by the notifying
  tab's color.
- The rest of the line (the message text after the colon) uses the theme's standard text color —
  i.e. no color override, inheriting `var(--fg)` like other transcript lines.
- The `view capture` link (rendered by `OpenFileLink`, shown when the notification carries
  `openFile`) gets the app's link color and reads as an actionable button, including a hover
  state — it currently has no distinct styling at all in this context (the existing `.file-link`
  hover/color rule is scoped to `.line.output`, which a message line never matches).

## Approach

`web/src/transcript-line.tsx`'s `renderLine` message branch (`:179-186`) moves the inline
`style={{ color: line.fromColor }}` off the outer `<div>` and onto a new `<span>` wrapping just the
dot + `line.from`. The outer `<div className="line message">` keeps no color override, so it falls
through to the theme's default text color exactly like `.line.output` and other line types do.

For the "view capture" link, add a CSS rule scoped to `.line.message .file-link` (a sibling scope
to the existing `.line.output .file-link` rule two lines above it in `theme.css`, so the unrelated
in-output file-link styling is untouched) giving it the accent/link color plus a small
button-like treatment (border + padding + border-radius) and a hover state that inverts to a
filled accent background, mirroring the existing `.modal-button` hover pattern already used
elsewhere in this file.

## Implementation steps

1. In `web/src/transcript-line.tsx`, change the message branch to:
   ```tsx
   if (line.type === 'message') {
     return (
       <div key={index} className="line message" {...hitProps}>
         <span className="message-from" style={{ color: line.fromColor }}>● {line.from}</span>
         {line.text ? `: ${highlightText(line.text, highlight, index)}` : ''}
         {line.openFile && <OpenFileLink path={line.openFile} client={client} />}
       </div>
     );
   }
   ```
2. In `web/src/theme.css`, near `.line.message { font-weight: 600; }` (`:329`), add:
   ```css
   .line.message .file-link {
     color: var(--accent); cursor: pointer; text-decoration: none;
     border: 1px solid var(--accent); border-radius: 4px; padding: 0 6px;
   }
   .line.message .file-link:hover { background: var(--accent); color: var(--bg); }
   ```
3. Run `./scripts/run.mjs check-diff`.

## Tests

Add to `web/src/transcript-line.test.tsx` (in the existing `'renderLine — message openFile link'`
describe block, or a new adjacent block):

- `only the dot/time/tab prefix is colored by the notifying tab's color` — render a `message` line
  with `fromColor: '#ff0000'`, query for `.message-from`, assert its inline `style.color` is the
  fromColor, and assert the outer `.line.message` element itself has **no** `color` in its inline
  `style` (`el.style.color` is `''`).
- Existing two tests in that block (`renders a clickable link...`, `renders no link when...`)
  continue to pass unchanged — they only assert on `.file-link[role="link"]` presence/click
  behavior, not color, so they remain valid coverage that the restructuring didn't break the link.

## Spec updates

No functional spec currently documents notification-line coloring in this level of detail — check
`product/specs/notifications.md` and `product/specs/harness.md`'s "Auto-approve permissions"
section for any statement that the whole line (rather than just the prefix) is colored by the tab;
if none exists, no spec change is needed since this is a pure visual/styling fix to
already-documented behavior ("rendered as `<label>: Auto-approved a permission prompt`" — the
rendering mechanics of *how* it's colored aren't spec'd).

## Out of scope

- `.line.output .file-link` styling (in-transcript clickable file paths) — untouched; the new CSS
  rule is scoped to `.line.message .file-link` only.
- Any other message-line consumer (e.g. `state-change`, `incoming-message`, `schedule-fire`,
  `manual` notification types) — they render through the same `renderLine` message branch and
  automatically pick up the same fix, but no new tests are added for each event type since the
  rendering path is identical regardless of which event produced the line.
- `font-weight: 600` on `.line.message` — unrelated to color, left as-is.

## Verification

- `./scripts/run.mjs check-diff` passes.
- Manual: not possible in this environment (no browser); covered by the automated color-scoping
  test instead.
