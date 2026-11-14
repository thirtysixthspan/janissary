# File glob 7.2 — typed `file glob` entry, routing, help, and typed spec

**Complexity: 5/10** — ~42 added lines across 2 edited files and one new module, 11 requirements, 12 test scenarios (p=5.60)

Run order: piece 2 of 2 of file glob subplan 7, which is 7 of 9 in the file glob series. Subplan 7 is recorded whole in `product/plans/complete/file-glob-7-typed-file-glob-command.md`; the feature's canonical plan is `product/plans/complete/file-glob.md`. Depends on piece 1 (`product/plans/draft/file-glob-7-typed-file-glob-command-1-agent-run-refusal.md`: `gateAgentCommand` refuses `isFileGlobCommandLine` input), and on subplan 1 (`parseFileGlob`, `isFileGlobCommandLine`, `FILE_GLOB_USAGE`), subplan 4 (`globWorkspace`, `GLOB_TIMEOUT_MS`), and subplan 6 (`RemoteFileSystemPort.globPaths`), all landed on this branch.

This piece makes `file glob` a working typed command on local and remote tabs and documents it in `help file`, `help/commands.md`, and the ACP spec. It must land after piece 1: routing `file glob` in `src/commands/file.ts` is what makes the line dispatchable, and piece 1's gate is what keeps an agent run's `janissary file glob …` from falling through to the caller's `file` command.

## Design decisions

From the source plan:

- The typed glob runs against the same root as `file read`: a local tab's workspace directory, or its launch/project directory when it has none; a remote tab's remote clone only, never the local disk.
- On a remote tab it can also print `Remote connection unavailable.`, `The remote connection ended.`, or `The remote machine did not answer in time.`, exactly as `file read` does. A far-side line naming the sent `--path` spelling is rewritten to the path as typed, and a far-side containment refusal prints `Outside the workspace: <dir>.` with the typed `--path`.
- A typed glob's output carries no host tag. History and transcripts record the command as typed.
- `src/commands/file.ts` routes a `file glob` line (by `isFileGlobCommandLine`) to `globFilesInTab`, ahead of the read fallback, and adds the samples `file glob **/*.ts` and `file glob *.md --path product --limit 20`. Bare `file` still prints the read usage line.
- Agent runs are refused (piece 1); the spec section here states that.

Settled by subplans 1–6 and stated in the spec and help as implemented (these override the source plan where they differ):

- `.env`, `.env.example`, and every other `.env.*` name are secret files (`src/file-read/policy.ts`, `last.startsWith('.env.')`), so they are never listed, even with `--hidden`. The source plan's example that `file glob **/* --hidden` lists `.env.example` is wrong; the spec and help must not repeat it. Use `.github/workflows/ci.yml` alone as the `--hidden` example.
- A symbolic link to a file whose target is a secret file, lies outside the workspace, or can't be resolved is omitted, not counted toward the limit.
- `--path` checks run in the order of `resolveStart` in `src/file-glob/glob.ts`: lexical escape → `Outside the workspace: <dir>.`; missing → `Directory not found: <dir>.`; real location outside the root → `Outside the workspace: <dir>.`; not a directory → `Not a directory: <dir>.`; and only then a secret folder → `(no matches)` with no error line. So a `--path` naming a secret file such as `.env` prints `Not a directory: .env.`, and `--path .aws` prints `(no matches)`.
- A `--path` that is an in-root symbolic link is checked at its real location, and each match under it is also judged by its real path, so a link `cfg` → `.config` never lists `cfg/gh/hosts.yml`.

Subplan decisions:

- The remote branch rewrites the reply with `asTyped` only when `--path` was given. `remoteGlobPaths` returns `dir: undefined` with no `--path`, and returns the typed spelling unchanged for an absolute `--path` (answered locally, no request), so `asTyped` is a no-op there. A `--path` of `.` or `./` is sent as `''` (the root; `paths.to` in `src/file-navigator/remote/port-paths.ts` normalizes it) and is never refused.
- A rejection is mapped with `rejectionLine(error, args.dir ?? '.')`. With no `--path` the far side sends no path for its containment check (`paths` returns `[]` in `src/remote/filesystem/glob-paths-operation.ts`), so the `'.'` fallback never surfaces; connection failures (`ENDED_REASON`, `TIMED_OUT_REASON` in `src/file-navigator/remote/port-requests.ts`) and `REMOTE_UNAVAILABLE` print unchanged, exactly as `readRemoteFile` in `src/file-read/tab-read.ts` does.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `parseFileGlob`, `isFileGlobCommandLine`, `FILE_GLOB_USAGE`, `FileGlobArgs` | `src/file-glob/command.ts` | Parsing and the usage line; the line test for routing. |
| `globWorkspace(root, args, deadline)`, `GLOB_TIMEOUT_MS` | `src/file-glob/glob.ts` | The local glob. Call it with the already-parsed args; don't call `globWorkspaceCommand`, which would parse a second time. |
| `RemoteFileSystemPort.globPaths(root, args)` → `{ text, dir }` | `src/file-navigator/remote/port.ts` (delegates to `remoteGlobPaths` in `port-reads.ts`) | The remote request; `dir` is the spelling sent, `undefined` without `--path`. `port.ts` is at the 200-line limit and is not edited. |
| `localReadRoot`, `readFileInTab`, and the private `asTyped` and `rejectionLine` | `src/file-read/tab-read.ts` | Root choice, the remote flow to mirror (`readRemoteFile`), and the sent-to-typed and refusal-to-line mapping. |
| `withRemoteTabPort`, `REMOTE_UNAVAILABLE` | `src/file-read/remote-tab-port.ts` | The remote port lifecycle (unavailable line with no channel, ready promise, or workspace; port disposed in `finally`), called with prefix `file-glob`. |
| `appendCommandOutput` | `src/command/append.ts`, imported by `src/commands/file.ts` | Unchanged output path, untagged. |
| `fakeChannel` and the `on a remote tab` block | `src/commands/file.test.ts` | The fake managers, remote channel, and `readWithReply` pattern to copy for glob. |
| `src/file-read/tab-read.test.ts` | tests | `managersWith` fake to mirror in the new test. |

## Proposed changes

Land in one change; the order below keeps typecheck green at every step.

- `src/file-read/tab-read.ts`: add `export` to `asTyped` and `rejectionLine` so the glob entry reuses them rather than duplicating them. No behavior change for `file read`.
- New `src/file-glob/tab-glob.ts` exporting `globFilesInTab(managers: Managers, label: string, input: string): Promise<string>`, shaped like `readFileInTab`: parse with `parseFileGlob` and return its `error` (the usage line) before looking up the tab; pick the root with `localReadRoot`; on a local root return `globWorkspace(root, args, Date.now() + GLOB_TIMEOUT_MS)`. On a remote tab (root `undefined`) a private helper calls `withRemoteTabPort(managers, label, 'file-glob', …)`, awaits `port.globPaths(workspace, args)`, returns `asTyped(text, dir, args.dir)` when both `dir` and `args.dir` are defined and `text` otherwise, and in its `catch` returns `rejectionLine(error, args.dir ?? '.')`. Imports carry `.js` (`../file-read/tab-read.js`, `../file-read/remote-tab-port.js`, `./command.js`, `./glob.js`, `../managers.js` as a type import).
- `src/commands/file.ts`: in `run`, test `isFileGlobCommandLine(command_)` first (on the raw line, as `isFileMutationCommandLine` is tested today), then mutation, then the read fallback; append the two samples after the `file read` samples. Bare `file` and `file globs x` still reach `readFileInTab` and print the read usage line.
- `help/file.md`: update the opening sentence so it covers finding files by path as well as reading and writing. Add `file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]` to the **Usage** list after the `file read` line, and add a **Finding files** block after the read **Examples** and before **Writing and editing**, in the page's bold-heading style. It covers: what it lists (paths only, never contents); the root; the pattern rules (`**`, `*`, `?`, `{a,b}`, case-sensitive, a single whitespace-free token, anchored to `--path`, no widening of a slash-free pattern, so `*.ts --path src` lists `src/a.ts` but not `src/x/b.ts`); root-relative forward-slash output that can be passed straight to `file read`; sorted order; the hidden, `node_modules`, and git-ignored rules and what `--hidden` widens (including that wildcards then match dot-names); `.git` never listed; the outside-git behavior; secret files left out, naming `.env` and `.env.*` and the credential locations, even with `--hidden`; symbolic links (directory links never entered or listed; file links listed unless the target is secret, outside, or broken); `--dirs` with its trailing `/`, empty directories included, the `--path` directory itself excluded; the limit (default 100, 1–1000) and its truncation line; `(no matches)`, including for a secret `--path` folder; the 30-second timeout line and that only the truncation line prints when the limit ends the search; each bad-`--path` line; the remote lines; the usage line and what prints it (missing pattern, second pattern, unknown or repeated flag, `--path` without a value or followed by a flag, `--limit` not a positive whole number or above 1000); and at least two examples.
- `help/commands.md`: in the `file` row (`| \`file\` | Workspace text files: …`), add `file glob <pattern>` lists matching paths, with its flags, keeping the row in its alphabetical place.
- `product/specs/acp.md`: add a `### File glob` section after `### File read` (before `### Typed file writes and edits`), in that section's style (syntax and parser first, then root, then output, then failures), stating every typed rule from the source plan's Design decisions as corrected above: syntax and flag rules, glob semantics, anchoring, root-relative output, case sensitivity, hidden and ignored paths, `.git`, wildcards and dot-names under `--hidden` (with `.github/workflows/ci.yml` as the example and `.env.*` excluded), the outside-git behavior, secret files and secret link targets, the linked `--path` real-location check, the limit and its range, truncation, every bad-`--path` line and their order, the secret `--path` folder giving `(no matches)`, `(no matches)`, the timeout and its precedence with the limit, files versus `--dirs` and its output, symbolic links, sorted order, the remote root through the `glob-paths` operation and the remote lines, no host tag on typed output, history as typed, the workspace root, the usage line, that it matches names only (content search is `file grep`), and that agent runs are refused. Primer, grant counts, authorization, the loop's workspace routes, and ACP-loop text are added in subplan 8; this section does not mention them yet beyond saying the command is typed-only in this version.

## Tests

- New `src/file-glob/tab-glob.test.ts`, mirroring `src/file-read/tab-read.test.ts`'s `managersWith` fake plus a temporary directory: a local tab with a workspace globs that workspace; a tab without one globs the launch directory; a remote tab with no channel prints `Remote connection unavailable.`; malformed input (`file glob`) prints `FILE_GLOB_USAGE` without calling `byLabel`.
- `src/commands/file.test.ts`, reusing `fakeChannel` and the existing `beforeEach` roots: a `file glob *.md` line on a local tab prints the workspace's `notes.md` untagged; bare `file` still prints the read usage. In the `on a remote tab` block: a glob sends one `glob-paths` request on a session starting `file-glob-` with the pattern, mapped `dir`, and limit, and prints the reply untagged; `--path ./notes/` sends `dir: 'notes'` and a far-side `Directory not found: notes.` prints `Directory not found: ./notes/.`; the far-side `OUTSIDE_ROOT_REASON` error reply for `--path ../x` prints `Outside the workspace: ../x.`; an absolute `--path` prints `Outside the workspace: <dir>.` with no request sent; the ended line prints when the channel closes mid-glob (copy the mid-read case); and the session is detached after a successful and a rejected glob.
- `src/commands.test.ts` keeps passing with the edited `help/commands.md` row and the new samples (the sample test resolves each to the `file` entry).

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, local tab: run `file glob **/*.test.ts --path src/file-read` and confirm a sorted list of root-relative test paths under `src/file-read/`. Run `file glob * --dirs --path src --limit 5` and confirm five `src/<name>/` lines plus the truncation line. Run `file glob nothing-matches-this` and confirm `(no matches)`. Run `file glob *.ts --path missing` and confirm `Directory not found: missing.` Run `file glob .env.* --hidden` in a workspace whose only `.env.*` file is `.env.example` and confirm `(no matches)`. Run `help file` and confirm the glob section.
- Manual, remote tab (if one is available): run `file glob *.md` and confirm the remote clone's files, untagged; run `file glob * --path ../x` and confirm `Outside the workspace: ../x.`.

## Out of scope

The agent-run refusal in `gateAgentCommand`, its tool-table tests, and the `product/specs/agent-command.md` paragraphs are piece 1. The ACP vocabulary, role grants, tool table primer and extraction, the two loop `runWorkspace` branches (`src/acp/run-prompt.ts`, `src/remote/serve-acp-loop.ts`), and the ACP spec's primer, grant-count, and authorization text are subplan 8. Completion and `product/specs/tab-completion.md` are subplan 9. User documentation under `documentation/` is not changed here. `file glob` for `agent` runs, a web UI beyond transcript output, and per-pattern authorization are out of scope for the whole feature.
