# Validate clone prerequisites before leftover deletion

Issue (PR 1175 backlog): Validate clone prerequisites before deleting a leftover workspace.

Complexity rating: 4/10

## Goal

Both the local launch resolver and the remote provisioner remove a leftover workspace folder, and announce it, before `WorkspaceManager.create` checks that the project has a git repository with an `origin` remote. A launch that was always going to fail can still erase the uncommitted work in a leftover. Separately, `removeLeftoverWorkspace` calls `untrustWorkspace` outside its error handler, so a failed trust-file write after the folder is gone throws past the refusal and the cleanup notice both.

## Approach

- **Preflight.** Split the repository and `origin` lookup in `src/workspace/manager.ts` out of `create` into a private `originUrl()`, and expose it as `preflight()`, which returns the error text `create` would return, or undefined. `create` keeps using the same lookup, so its errors are unchanged.
- **Local launches.** `clearLeftover` in `src/launch-name/local.ts` asks `managers.workspace.preflight()` before it removes anything. When the preflight fails it leaves the leftover alone and lets the launch go on, so the caller's `create` fails with exactly the error the launch has always reported (`No git repository found. Cannot create workspace.` or `Failed to create workspace: …`), and no cleanup notice is posted.
- **Remote provisioning.** `provisionRemoteWorkspace` asks `workspaces.preflight()` before removing a leftover and answers `workspace-failed` with its error, which is the same frame `create` would have sent.
- **Cleanup errors.** `removeLeftoverWorkspace` untrusts the folder first, inside the same error handler as the removal. A trust-file write failure now refuses the launch with the folder untouched, and success, and so the cleanup notice, is reported only after every step has finished.
- **Partial removal.** A removal that fails partway leaves whatever it could not remove in place. The launch is refused with the existing `could not remove leftover workspace` line carrying the reason, no cleanup notice is posted, and the next launch under that name treats what is left as a leftover and tries again. This is documented in the specs.

Preflight is only asked when a leftover exists, so an ordinary launch spawns no extra `git` process.

## Implementation steps

1. Add `originUrl()` and `preflight()` to `WorkspaceManager`, with `create` using `originUrl()`.
2. Call `preflight()` in `clearLeftover` (`src/launch-name/local.ts`).
3. Call `preflight()` before the leftover removal in `provisionRemoteWorkspace` (`src/remote/serve-provision.ts`).
4. Move `untrustWorkspace` to the front of the handled block in `removeLeftoverWorkspace` (`src/launch-name/leftover.ts`).

## Tests

- `src/workspace/manager.test.ts`: `preflight` returns undefined for a repo with `origin`, the no-repo error, and the missing-`origin` error, without creating anything.
- `src/profile/manager.test.ts`: `agent bob -w` over a leftover with a failing preflight never calls the removal, posts no cleanup notice, and reports the create error as before.
- `src/harness/manager.test.ts`: the same for `harness claude as bob -w`.
- `src/remote/serve.test.ts`: with `origin` removed from the root and a leftover holding a file, `provision` answers `workspace-failed` and the file survives.
- `src/launch-name/leftover.test.ts`: when the trust-file update throws, `removeLeftoverWorkspace` returns its error and the folder and its contents survive.

## Out of scope

- A clone that fails after the leftover was removed (network, auth); the plan's automatic cleanup policy accepts that loss.
- Making the trust-file update in `removeWorkspace` report errors; that path runs at tab close and shutdown, not during a launch.

## Specs and docs

- `product/specs/workspaced-agent.md`, `product/specs/remote-server.md`: a leftover is kept when the launch cannot clone, and how a failed or partial cleanup is reported.
- `help.md` and `documentation/user-documentation/`: checked; neither describes leftover cleanup.
