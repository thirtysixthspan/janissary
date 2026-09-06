# Refresh the harness launch dialog screenshot

**Complexity: 2/10** - regenerate one deterministic documentation screenshot from the built UI and update its alternative text.

## Issue

The harness page describes the new **E2E browser** checkbox, but its launch-dialog screenshot and alternative text still show the older form. The image now contradicts both `HarnessLaunchDialog.tsx` and `product/specs/harness.md`.

## Approach

Use the existing host-only documentation screenshot pipeline, which launches the real built application with fixture data and crops the element identified by `data-doc-shot="harness-launch-dialog"`. Regenerate only `harness-launch-dialog.png`, then update the page's alternative text to enumerate the E2E browser control in the same order as the dialog.

## Implementation

1. Build the current web UI with `npm run build:web`.
2. Run `./scripts/run.mjs docs-screenshots harness-launch-dialog` outside a Janissary sandbox.
3. Inspect the replacement PNG and confirm **E2E browser (-b)** appears between **Offline** and **Auto-approve**.
4. Update the screenshot alternative text in `documentation/user-documentation/advanced-agents/harness.md`.
5. Check every documentation reference to the asset and remove only this resolved backlog entry.

## Tests

Run `./scripts/run.mjs check-diff`. The screenshot generator itself is the integration check for the built UI. Inspect the generated image at its original resolution and confirm the source asset changed while `documentation/.vitepress/dist/` remains untouched.

## Documentation

The PNG and its alternative text are the documentation change. No behavior spec update is needed because the existing spec already names the field and its ordering accurately.

## Out of scope

- AI-generating or hand-editing the screenshot.
- Updating unrelated screenshots.
- Committing generated VitePress build output.
