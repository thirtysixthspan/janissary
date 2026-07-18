# Make the capture link a bare clipboard icon (drop the pill outline)

**Complexity: 2/10** — an icon swap plus a small CSS change to one selector, with one new assertion in an existing test file. No new modules, no protocol or server changes.

The "View capture" affordance on an auto-approval notification line (the `OpenFileLink` in `web/src/transcript-line.tsx`) currently renders a camera glyph wrapped in a bordered, rounded, padded pill (`.line.message .file-link` in `web/src/theme.css` gives it `border`, `border-radius`, `padding`, and a filled-background hover). The backlog issue asks for the pill outline removed so it reads as just an icon, and for the glyph to be a clipboard rather than a camera.

## Design decisions

- **Icon**: switch from `faCamera` to `faClipboard`. The issue names `fa-regular fa-clipboard`; the regular-weight variant lives in `@fortawesome/free-regular-svg-icons`, which is **not installed**, and this task's change set is limited to source/tests/specs/docs (not `package.json`/`package-lock.json`), so pulling in a new dependency is out of scope. `@fortawesome/free-solid-svg-icons` — the single package every entry in `web/src/icons.ts` already imports from — provides `faClipboard`, so the clipboard glyph is used from there, matching the existing icon-registry convention.
- **Rename the registry entry**: the glyph is no longer a screenshot/camera, so rename the semantic export `screenshotIcon` → `viewCaptureIcon` (its sole consumer is the capture link). This keeps `web/src/icons.ts` honest — the name reflects the affordance, not the old camera.
- **Drop the pill**: strip `border`, `border-radius`, and `padding` from `.line.message .file-link`, and change its `:hover` from a filled-accent background to a plain accent→foreground color shift, mirroring how `.line.output .file-link:hover` already behaves. The result is a bare icon in the accent color that brightens on hover. Only the capture link uses `.line.message .file-link`, so no other affordance is affected.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Icon registry, all from `free-solid-svg-icons` | `web/src/icons.ts:9` | Repoint the entry to `faClipboard`, rename it |
| Capture link component | `web/src/transcript-line.tsx:94` (`OpenFileLink`) | Swap the icon import/usage only |
| Pill styling for the link | `web/src/theme.css:353` | Remove the pill declarations |
| Existing capture-link tests | `web/src/transcript-line.test.tsx:169` | Add one icon assertion beside them |

## Proposed changes

**Icons.** In `web/src/icons.ts`, change `faCamera as screenshotIcon` to `faClipboard as viewCaptureIcon` (still from `@fortawesome/free-solid-svg-icons`).

**Capture link.** In `web/src/transcript-line.tsx`, update the import on line 4 to `viewCaptureIcon` and the `<FontAwesomeIcon icon={…} />` in `OpenFileLink` to use it. No structural/markup change — the link keeps its `file-link` class, `role="link"`, `aria-label="View capture"`, title, and click behavior.

**Styles.** In `web/src/theme.css`, rewrite `.line.message .file-link` to keep only `color: var(--accent); cursor: pointer; text-decoration: none;` (dropping `border`, `border-radius`, `padding`), and change `.line.message .file-link:hover` to `color: var(--fg);` (dropping the `background`/`color: var(--bg)` fill).

## Tests

- `web/src/transcript-line.test.tsx` (existing `describe('renderLine — message openFile link', …)`): add an assertion that the rendered capture link contains an SVG whose `data-icon` is `clipboard` (FontAwesome sets `data-icon` to the glyph's icon name), confirming the camera→clipboard swap. The existing "renders the capture link as an icon, not text", click-sends-`edit`, and no-link-without-`openFile` cases continue to cover the rest and must still pass.

## Out of scope

- No new FontAwesome dependency (the regular-weight `fa-regular` variant); the solid clipboard glyph is used from the already-installed package.
- No change to when the capture file is written, the click-to-open-in-editor behavior, or the notification text.
- No change to the plain `.line.output .file-link` styling (a different affordance).

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: trigger (or simulate) an auto-approval notification carrying a capture file, and confirm the notification line shows a bare clipboard icon with no bordered pill, that it brightens on hover, and that clicking it still opens the captured text in an editor tab.
