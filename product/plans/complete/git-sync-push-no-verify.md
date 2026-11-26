# fix(git): push git-sync commits with --no-verify

**Complexity: 1/10** — ~1 changed line in 1 file, 2 requirements (p=3.21)

## Goal

The backlog issue reads "git sync pushes should be executed with --no-verify". Saving a git-synced file pushes its `sync: <filename>` commit from the shared `git-sync` workspace. That workspace is a sparse worktree holding only `product/`, so any `pre-push` hook the project configures runs in a checkout that lacks the project's code and dependencies. Under the 60-second command deadline, that hook can fail or time out and reject a push that only carries a backlog or plan edit. Passing `--no-verify` to the sync push skips those hooks, so the sync commit reaches `origin` whatever hooks the project defines.

## Requirements

1. "git sync pushes should be executed with --no-verify": the save-triggered sync cycle's push runs `git push --no-verify origin HEAD:<branch>`.
2. The `--no-verify` push still targets the resolved sync branch (`HEAD:<branch>`), for the detected default branch, the checked-out fallback, and the `master` fallback alike.

## Design decisions

- Only the push gets `--no-verify`. The issue names pushes, and the `sync:` commit step keeps running as it does today (Assumption 2).
- The flag is placed directly after `push`, before the remote and refspec, matching git's documented `git push [<options>] [<repository> [<refspec>...]]` order.
- The file navigator's `commitRoot` push in `src/git/commit.ts` is left alone. It runs in the user's own checkout as a user-armed action, where the user's hooks belong (Assumption 3).

## Preserved behavior

1. The push still carries `GH_TOKEN` in its environment. The push must not run without the project token. Pinned by `passes GH_TOKEN in the environment of the pull and push execFile calls` in `src/git/sync.test.ts`.
2. A failed pull/rebase still skips the push. No push runs after a failed rebase. Pinned by the test in `src/git/sync.test.ts` that asserts `commands.some((command) => command.startsWith('push'))` is `false`.
3. The pull-only cycle still never pushes. Opening a synced file must not push. Pinned by `the pull-only cycle pulls/rebases without committing or pushing` in `src/git/sync.test.ts`.

## Assumptions

1. The sync push is a single call site: `src/git/sync.ts:188` `await commands.run(['push', 'origin', \`HEAD:${branch}\`], dir, githubEnv());`.
2. The issue concerns pushes only; the commit call stays as `src/git/sync.ts:164` `await commands.run(['commit', '-m', \`sync: ${path.basename(filePath)}\`, '--', filePath], dir);`.
3. `commitRoot` is a separate push path, in the user's own checkout: `src/git/commit.ts:55` `await runGit(['push', 'origin', 'HEAD'], root);`.

## Existing functionality

1. `SyncCommandRunner.run` executes every sync git command with the deadline and abort signal: `src/git/sync-command.ts:17` `async run(args: string[], cwd: string, env?: NodeJS.ProcessEnv`.
2. The `execFile` mock in `src/git/sync.test.ts:16` records each command's args, which `commandLines()` joins for assertions: `src/git/sync.test.ts:56` `function commandLines(): string[]`.

## Implementation steps

1. In `src/git/sync.ts`, change `push` so its argument list is `push`, `--no-verify`, `origin`, `HEAD:<branch>`. Update the existing assertions in `src/git/sync.test.ts` that match `push origin HEAD:<branch>` (the push-failure pattern and the three branch tests) to the new command line, and add the requirement tests below. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Update the git-sync section of `product/specs/editor-tab.md` to say the push skips the repository's push hooks. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change adds nothing a user sees or operates; the sync status icon and notifications behave as before.

## Tests

In `src/git/sync.test.ts`:

1. Requirement 1: a save cycle's push call has args exactly `['push', '--no-verify', 'origin', 'HEAD:master']`.
2. Requirement 2: the existing branch tests (`main`, `trunk`, `master` fallbacks) assert `push --no-verify origin HEAD:<branch>`.

## Out of scope

- Adding `--no-verify` to the `sync:` commit.
- Changing the file navigator's `Commit to origin` push in `src/git/commit.ts`.
- Any change to user documentation; it does not describe push hooks.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes.
2. Manual: in a project with `syncPaths` configured, add an executable `.git/hooks/pre-push` that runs `exit 1`. Open a synced file such as `product/backlog/issues.md` in an editor tab, edit it, and save. The sync status icon should return to synced and the `sync: issues.md` commit should appear on `origin`. A failure looks like the icon entering its error state and a `Could not sync issues.md: ...` notification naming the hook rejection.
