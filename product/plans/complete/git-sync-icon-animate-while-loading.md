# Animate the git sync icon while a synced file is loading

**Complexity: 1/10** — a pure CSS addition keyed off classes the component already renders; no component or behavior change.

## Goal

Per the backlog: "when a git synced file is opened in an editor, the editor content is empty while syncing. When this happened the git sync button should animate to communicate syncing." A synced editor tab opens immediately, before its shared sync workspace exists, and shows no content until `sync` leaves the `provisioning` state (`src/... EditorTab.tsx` `fetchContent`, guarded by `if (editor.sync === 'provisioning') return;`, per `product/specs/editor-tab.md:223-225`). During both `provisioning` and `syncing`, the icon (`web/src/editor/EditorSyncIcon.tsx`) currently renders as a static, non-interactive glyph — nothing on screen signals that work is happening while the buffer is empty.

## Approach

The icon already gets a distinct CSS class per state (`.editor-sync-icon--provisioning`, `.editor-sync-icon--syncing`, defined in `web/src/theme.css`). The glyph itself is `faArrowsRotate` (`web/src/icons.ts:30`), a rotate/refresh icon, which reads naturally as "spinning" to indicate in-progress work. Add a CSS rotation keyframe animation applied to the icon's `<svg>` while either of those two classes is present — no component or markup changes needed, matching the CSS-only shape of the sibling buttonface fix.

## Implementation steps

1. In `web/src/theme.css`, add a `editor-sync-spin` keyframes rule (continuous 360° rotation) and apply it via `.editor-sync-icon--provisioning svg, .editor-sync-icon--syncing svg { animation: editor-sync-spin 1s linear infinite; }`, placed near the existing `.editor-sync-icon` rules.

## Tests

No new test cases — CSS animations aren't observable through jsdom/RTL assertions, and the existing `web/src/editor/EditorSyncIcon.test.tsx` already asserts the `--provisioning`/`--syncing` classes render correctly per state; those are the hook the animation attaches to and remain unchanged. Run `./scripts/run.mjs check-diff` to confirm nothing regresses.

## Spec updates

- `product/specs/editor-tab.md:223-225` — add a sentence noting the sync icon animates (spins) while the tab shows the loading state, so the spec's "opens immediately showing a loading state instead of content" sentence also covers what the status icon does during that wait.

## Docs

- Checked `help.md` — no mention of the sync icon's appearance or animation. No update needed.
- Checked `documentation/user-documentation/` — no page describes the sync icon's states. No update needed.

## Out of scope

- The `synced`/`error` states — unaffected, no animation.
- Any change to how or when the buffer content loads.
