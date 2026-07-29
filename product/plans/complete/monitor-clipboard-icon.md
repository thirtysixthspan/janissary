# Use the clipboard icon in the monitor metadata bar instead of fa-bars

**Complexity: 1/10** — a single icon-alias swap in `web/src/icons.ts` with no consumer changes, plus updating the one test that asserts on the FontAwesome glyph name.

## Summary

The monitor reporting tab's metadata bar (`web/src/MonitorTab.tsx`) has an "Open context snapshot" button whose icon is aliased as `snapshotIcon`, currently mapped to FontAwesome's `faBars` (a hamburger icon) in `web/src/icons.ts:10`. Per the backlog, this should be a clipboard icon instead, matching the button's actual purpose (opening a snapshot/transcript of the monitor's context) and the clipboard glyph already used elsewhere in the app for similar "view captured content" actions (`viewCaptureIcon`, `web/src/icons.ts:33`).

## Approach

All consumers of the snapshot button already import `snapshotIcon` from `./icons` — nothing outside `icons.ts` needs to change. Swap the source glyph for `snapshotIcon` from `faBars` (solid set) to `faClipboard` (also available in the solid set, `free-solid-svg-icons`), keeping it in the same solid-icon export block so it stays visually consistent with the other icons rendered alongside it in `MonitorTab.tsx`'s `monitor-actions` group (`approveIcon`, `rejectIcon`, `resetIcon` are all solid-style).

## Implementation steps

1. In `web/src/icons.ts:10`, change `faBars as snapshotIcon,` to `faClipboard as snapshotIcon,` (still exported from `@fortawesome/free-solid-svg-icons`).
2. No changes needed in `web/src/MonitorTab.tsx` — it already references the icon only via the semantic alias `snapshotIcon`.

## Tests

- `web/src/MonitorTab.test.tsx:135` currently asserts `svg[data-icon="bars"]` for the "Open context snapshot" button. Update this assertion to `svg[data-icon="clipboard"]` to match the new icon.

## Out of scope

- Any other icon in `web/src/icons.ts`.
- Changing the button's behavior, title, or placement — only the glyph changes.
