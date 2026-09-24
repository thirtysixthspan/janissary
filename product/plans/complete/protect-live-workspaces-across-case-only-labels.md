# Protect live workspaces across case-only label changes

Issue (PR 1175 backlog): Preserve a live remote workspace when its requested label differs only by case.

Complexity rating: 3/10

## Goal

The launch-name check compares names without case, but the workspace-running check that guards leftover cleanup does not. `hasLivePeer` in `src/launch-name/leftover.ts` matches a peer record's label with strict equality, and the open-tab predicate in `src/launch-name/local.ts` matches a tab's workspace folder the same way. On a case-insensitive filesystem (the macOS default) `Foo` and `foo` are one folder, so a second instance launching `Foo` while a live peer owns `foo` sees nothing running, treats the folder as a leftover, and deletes the live peer's workspace out from under it.

## Approach

Use one case rule for every "does something already hold this name" question.

- Export the check's comparison from `src/launch-name/check.ts` as `sameLaunchName` and use it for the existing clash checks there.
- `hasLivePeer` matches a live peer record whose label is `sameLaunchName` as the requested one.
- The local open-tab predicate in `resolveLocalLaunchName` matches a tab whose workspace folder is the same path ignoring case, so a joined agent still using `foo`'s folder holds `Foo` too.
- `provisionRemoteWorkspace` already asks `isWorkspaceRunning` before it removes anything, so a peer owning a case variant now answers `name-in-use` with no cleanup, without any change there.

On a case-sensitive filesystem this refuses a launch that would have found a distinct folder. That matches what the name check already does for tabs and sessions rows, which treat `Foo` and `foo` as one name everywhere.

## Implementation steps

1. Rename `same` to the exported `sameLaunchName` in `src/launch-name/check.ts`.
2. Use it in `hasLivePeer` in `src/launch-name/leftover.ts`.
3. Use it in the tab predicate of `runningCheck` in `src/launch-name/local.ts`.

## Tests

- `src/launch-name/leftover.test.ts`: a live peer recorded as `foo` makes `Foo` running; the tab predicate is still asked about the requested path; the dead-peer case stays.
- `src/launch-name/local.test.ts` (new): a `-w` launch of `Foo` while an open tab named `bekir` uses `foo`'s workspace folder is refused as running, with nothing removed.
- `src/remote/serve.test.ts`: with a live peer recorded as `case-label` and a folder `case-label` holding a file, a `provision` of `CASE-LABEL` answers `name-in-use` and the file survives; the existing leftover-cleanup case stays.

## Out of scope

- Filesystem aliasing beyond case (Unicode normalization forms, 8.3 short names).
- The live instance lock inside the workspace, which is read from the path and already follows the filesystem's own case rule.

## Specs and docs

- `product/specs/workspaced-agent.md` and `product/specs/remote-server.md`: state that a workspace counts as running for any name that differs from its owner's only by case.
- `help.md` and `documentation/user-documentation/`: checked; neither describes the running check.
