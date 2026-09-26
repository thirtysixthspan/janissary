# Await the page open in a profile launch

## Complexity

2/10 — one arrow body in `src/profile/view-tabs.ts` changed to return its promise, plus one colocated test whose fake opener settles late; no new module and no wire change.

## Goal

`openProfileViewTabs` in `src/profile/view-tabs.ts` awaits each entry's `run()` and only then looks up the tab it opened. Every branch honors that except the web-address one: `webTarget` gives its target a block-bodied `run` that calls `managers.openFile.run(\`open page …\`)` and discards the returned promise. In the real pipeline the page plugin activates through a dynamic import, so on a launch where it has not loaded yet the lookup runs before the tab exists. The launch then notes `Could not open page tab "…"`, and the tab appears anyway, outside its authored group, position, focus, and dock. Make the page branch wait like the others.

## Approach

Change `webTarget`'s `run` to an expression-bodied arrow that returns `managers.openFile.run(\`open page ${authored}\`, issuingLabel)`, exactly the shape `fileTarget` already has directly above it. `OpenFileManager.run` returns `Promise<void>`, which `ViewTarget.run`'s return type already accepts, so no type changes.

The existing tests missed this because the fake `open` in `makeManagers` settles after a single `await Promise.resolve()`, which is within reach of the one microtask that `await undefined` yields. The new test delays the fake by a macrotask so the ordering is pinned.

## Implementation

1. In `src/profile/view-tabs.ts`, rewrite `webTarget`'s `run` as `() => managers.openFile.run(\`open page ${authored}\`, issuingLabel)`.
2. Run `./scripts/run.mjs check-diff`.

## Tests

In `src/profile/view-tabs.test.ts`, add a case where the fake page open resolves only after a `setTimeout(0)` (wrapping the existing fake implementation once with `mockImplementationOnce`), with a page entry authored into group 2 beside an existing group-2 tab. Assert the page tab is returned in `opened`, sits in group 2, and that no `Could not open page tab` note is pushed. It fails before the fix and passes after. The existing `opens each type through the manager that owns its command` and `reuses an already-open page tab on the same address, authored bare` cases must pass unchanged.

## Spec

`product/specs/profiles.md` (the `profile launch` section) already says a plugin tab opens through its plugin's activation and the launch waits for it before placing and focusing tabs. Name the web page tab there explicitly, since it is the plugin tab this fix brings in line.

## Docs

None needed: neither `help.md` nor `documentation/user-documentation/` describes the ordering of a profile launch's page open.

## Out of scope

- Any change to how `open page` itself activates the page plugin.
- The other `ViewTarget` branches, which already await.
