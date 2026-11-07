# Correct the PR description's dirty-handle retention statement

**Complexity: 2/10** — a description-only correction. It changes no source, test, spec, or documentation file. The branch changes are the fix plan and PR backlog; the PR body is updated after the branch commit is pushed.

## Goal

Make the implementation paragraph in PR #1957 describe dirty-handle retention and explicit unregistration accurately, without changing the rest of the title or body.

## Problem

The body says the app retains plugin dirty handles while their labels remain open. The `registerDirtyHandle(handle | null)` contract lets a plugin explicitly remove its registration while its tab stays open. The image editor keeps its registration through placement remounts, and the host prunes remaining registrations when labels close, so the current sentence overstates the retention rule.

## Decision

Replace only that sentence with wording that distinguishes explicit unregistration from placement remounts and closed-label cleanup: the host keeps a registration while its label stays open unless the plugin passes `null`; the image editor preserves its registration across placement remounts; and the host prunes any remaining registration when the label closes.

## Changes

### Pull request body, applied after the push

- In the implementation paragraph, replace only the sentence about retaining plugin dirty handles while labels remain open.
- State that explicit `registerDirtyHandle(null)` removes the registration, that the image editor keeps its registration across placement remounts, and that the host prunes a remaining registration when the tab closes.
- Preserve every other title and body paragraph exactly as written.

### Backlog

- Remove this resolved entry from `product/backlog/pull-request.md` and restore the exact comment-and-heading skeleton because it is the only entry.

### Plan

- Move this plan from `draft/` to `ready/`, then to `complete/`.

## Tests

None added. This correction changes no behavior. Check the wording against `web/src/plugins/api.ts`, `documentation/developer-documentation/tab-plugins.md`, and `product/specs/tab-plugins.md`. The existing `web/src/App.test.tsx` explicit-unregister test and image-editor placement lifecycle test cover the behavior the sentence describes. Run `check-diff` after each branch change; the description correction itself is verified by rereading the updated paragraph.

## Spec

`product/specs/tab-plugins.md` is unchanged. It already states that a plugin can drop its registration while its tab remains open.

## Docs

None needed. The developer documentation already explains explicit unregistration and placement remounts. This work only corrects the pull request description.

## Out of scope

- Source, test, spec, or documentation changes.
- The pull request title and every body paragraph other than the named retention sentence.
- Any remaining PR backlog entry; this is the only one.
