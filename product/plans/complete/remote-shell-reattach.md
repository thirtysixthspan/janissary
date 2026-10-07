# Reattach detached remote shells

**Complexity: 2/10** — one opener-routing correction and a regression test, with the existing remote-shell behavior already specified.

## Root cause

An adopted remote shell's preset includes its remote workspace so the opener can route its terminal to the attached SSH channel. `openPluginTab` also treats every preset workspace as a local workspace. The local-workspace match wins in `terminalConfinement`, so the remote cwd reaches `spawnPluginTerminal` and is rejected against the local project root.

## Correct behavior

Attaching a detached remote shell restores its existing PTY under the saved label, cwd, offline mode, and marker nonce. The remote cwd is resolved by the remote host and must not be checked against the local project's root.

## Reproduction

Added an adopted-shell case to `src/tab/opening-state.test.ts` with a preset remote target, remote workspace `/remote/workspace`, cwd `/remote/workspace/src`, and recorded PTY `rpty-adopted`. `npm run test:server -- --run src/tab/opening-state.test.ts` fails with `Cannot start a terminal in /remote/workspace/src: it is outside the project root /Users/anonymouscoward/dev/janissary/.janissary/workspace/bughunt.` The same case represents the attach path that restores the remote shell's retained PTY.

## Approach

Do not treat a remote preset's workspace as a local clone in `openPluginTab`. Keep it available to the remote workspace lookup, which routes the terminal registration to the resumed channel. Preserve local workspace ownership behavior for non-remote presets.

## Implementation steps

1. Exclude remote presets from the local `own` clone passed to terminal confinement.
2. Keep the adopted shell's remote workspace out of the newly restored tab's local `workspaceDir` ownership field.
3. Extend the adopted-shell regression case to assert remote PTY registration, the saved offline mode, and no local workspace ownership.
4. Align `product/specs/sessions-tab.md` with the existing guarantee that the saved remote cwd is used on its host and is independent of paths on the local machine.
5. Correct the pre-existing connection-plug style test expectation that made the required full PR gate fail. The implementation uses the direct-child selector `.tab-meta > .connection-plug`; the test still expects the earlier descendant selector.

## Regression test

`TabOpeningState.openPluginTab` in `src/tab/opening-state.test.ts` covers an adopted remote shell with a remote workspace preset. It must register the existing PTY with the attached channel and saved terminal state without invoking local terminal startup.

## Verification

- Run `./scripts/run.mjs check-diff` after each change.
- Rerun the adopted-shell test and confirm it passes with remote PTY registration.
- Live E2E is not possible without an available SSH peer with a detached shell to attach; no peer or destination was supplied with the report. The browser connection is available, but an unrelated local shell cannot exercise remote reattachment.

## Out of scope

- Changes to SSH reconnection, remote workspace lifecycle, or session persistence.
- Changes to local plugin terminal confinement.
- Public help or user-documentation updates; documented user behavior is unchanged.
- Changes to the connection-plug stylesheet or its rendered behavior; only its stale selector assertion is corrected so the full PR gate reflects the current implementation.
