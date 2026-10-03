# Regenerate the New harness dialog screenshot for the Auto-resume toggle

**Complexity: 1/10** — one generated PNG, one alt-text line, and one clause of prose that the regenerated image contradicts. No code change: the dialog already renders the toggle.

## Problem

`documentation/user-documentation/advanced-agents/harness.md` introduces the launch dialog with a screenshot whose alt text lists every field except the Auto-resume toggle the dialog now carries, while the prose immediately below it describes that toggle. The one image a reader has of the dialog therefore misstated its contents on the page whose job is introducing it.

The regenerated image also settled a second question: the same paragraph said **E2E browser** "starts unchecked", and the capture shows it checked — `initialFields` sets `browser: true`, so the prose had been wrong since the browser became the default rather than since this feature.

## Approach

1. `npm run build:web`, then `./scripts/run.mjs docs-screenshots harness-launch-dialog` — the manifest entry already exists (`name: 'harness-launch-dialog'`, `setup: ['harness']`, target `harness-launch-dialog`), so no manifest change is needed. The pipeline writes `documentation/public/screenshots/harness-launch-dialog.png` in place and removes its own scratch directory.
2. The alt text gains `auto-resume`, so it lists every field the dialog shows.
3. The **E2E browser** clause becomes "starts checked", matching both the capture and `web/src/harness/HarnessLaunchDialog.tsx`'s `initialFields`.

The capture is the check on all three: with claude selected, Auto-resume renders greyed out and unchecked, because `autoResume: ['codex']` does not list claude — which is the behavior the neighboring paragraph describes.

## Tests

None. The image is generated and the prose change is a factual correction; no test asserts either.

## Verification

`git status --short` names exactly one path, `documentation/public/screenshots/harness-launch-dialog.png`. Then read the image: the Auto-resume row reads `Auto-resume (--auto-resume) — codex only`, disabled, because the fixture opens on claude.