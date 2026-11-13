# File glob 7 — typed `file glob` command, agent-run refusal, help, and typed spec

**Complexity: 5/10** — ~48 added lines, 3 files edited, 10 requirements, 14 test scenarios (p=5.73)

Run order: 7 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 (`parseFileGlob`, `isFileGlobCommandLine`), subplan 4 (`globWorkspace`), and subplan 6 (`RemoteFileSystemPort.globPaths`).

This subplan makes `file glob` a working typed command on local and remote tabs, documents it in `help file` and the ACP spec, and closes the one path by which an `agent` run could reach it. The refusal lands here, not with the ACP wiring, because this is the change that makes a `file glob` line dispatchable: without it an agent run's `janissary file glob …` would fall through to the caller side and run there.

## Design decisions

All from the source plan:

- The typed glob runs against the same root as `file read`: a local tab's workspace directory, or its launch/project directory when it has none; a remote tab's remote clone only, never the local disk.
- On a remote tab it can also print `Remote connection unavailable.`, `The remote connection ended.`, or `The remote machine did not answer in time.`, exactly as `file read` does. A far-side line naming the sent `--path` spelling is rewritten to the path as typed, and a far-side containment refusal prints `Outside the workspace: <dir>.` with the typed `--path`.
- A typed glob's output carries no host tag. History and transcripts record the command as typed.
- `src/commands/file.ts` routes a `file glob` line (by `isFileGlobCommandLine`) to `globFilesInTab`, ahead of the read fallback, and adds the samples `file glob **/*.ts` and `file glob *.md --path product --limit 20`. Bare `file` still prints the read usage line.
- Agent runs are not supported in this version. `gateAgentCommand` in `src/acp/tool-table.ts` refuses `isFileGlobCommandLine` input with `Agent: command not permitted: <command>.`, with or without the `file` grant, the way `file write` and `file edit` are refused, so an agent run's glob never falls through to the caller side. The third `runWorkspace`, in `src/agent/execute.ts`, is left alone.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `localReadRoot`, `readFileInTab`, and the private `asTyped` and `rejectionLine` | `src/file-read/tab-read.ts` | Root choice, the remote flow to mirror, and the sent-to-typed and refusal-to-line mapping. |
| `withRemoteTabPort`, `REMOTE_UNAVAILABLE` | `src/file-read/remote-tab-port.ts` | The remote port lifecycle, called with prefix `file-glob`. |
| `appendCommandOutput` | `src/command/append.js` via `src/commands/file.ts` | Unchanged output path, untagged. |
| `gateAgentCommand` | `src/acp/tool-table.ts` | The existing mutation refusal to extend. |
| `src/commands/file.test.ts`, `src/file-read/tab-read.test.ts` | tests | The fake managers and remote channel to copy. |

## Proposed changes

- `src/file-read/tab-read.ts`: export `asTyped` and `rejectionLine` so the glob entry reuses them rather than duplicating them. No behavior change for `file read`.
- New `src/file-glob/tab-glob.ts` exporting `globFilesInTab(managers, label, input)`: parse with `parseFileGlob` (returning the usage line on error), pick the root with `localReadRoot`, and on a local root return `globWorkspace(root, args, Date.now() + GLOB_TIMEOUT_MS)`. On a remote tab it calls `withRemoteTabPort(managers, label, 'file-glob', …)`, sends `port.globPaths(workspace, args)`, rewrites the reply with `asTyped(text, sentDir, typedDir)` when a `--path` was given, and maps a rejection with `rejectionLine(error, typedDir)`. With no `--path`, a rejection that is not a connection line is printed as is.
- `src/commands/file.ts`: the glob branch and the two samples.
- `src/acp/tool-table.ts`: in `gateAgentCommand`, refuse `isFileGlobCommandLine(input)` beside the mutation refusal, before the read check.
- `help/file.md`: document `file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]` in its own section: what it lists, the root, the pattern rules (`**`, `*`, `?`, `{a,b}`, case-sensitive, anchored to `--path`, no widening of a slash-free pattern), root-relative output, the hidden and ignored rules and what `--hidden` widens, `.git` never listed, secret files left out, `--dirs` with its trailing `/`, the limit and its truncation line, `(no matches)`, the 30-second timeout line, symbolic link behavior, each bad-`--path` line, the remote lines, the usage line and what prints it, and at least two examples. Update the page's opening sentence so it no longer describes only reading and writing.
- `help/commands.md`: extend the `file` row's description with `file glob <pattern>` listing matching paths. The row keeps its alphabetical place.
- `product/specs/acp.md`: add a `### File glob` section after `### File read` stating every typed rule from the source plan's Design decisions: syntax and flag rules, glob semantics, anchoring, root-relative output, case sensitivity, hidden and ignored paths, `.git`, wildcards and dot-names under `--hidden`, the outside-git behavior, secret files, the limit and its range, truncation, every bad-`--path` line, `(no matches)`, the timeout and its precedence with the limit, files versus `--dirs` and its output, symbolic links, sorted order, remote lines, no host tag on typed output, history as typed, the workspace root, the usage line, that it matches names only (content search is `file grep`), and that agent runs are refused. Primer, grant, and ACP-loop text are added in subplan 8.
- `product/specs/agent-command.md`: in both the local and the remote paragraph, note that `janissary file glob …` returns `Agent: command not permitted: <command>.` in this version, with or without the grant.

## Tests

- New `src/file-glob/tab-glob.test.ts`, mirroring `src/file-read/tab-read.test.ts`: a local tab with a workspace globs that workspace; a tab without one globs the launch directory; a remote tab with no channel prints `Remote connection unavailable.`; malformed input prints the usage line without looking up the tab.
- `src/commands/file.test.ts`: a `file glob` line routes to the glob entry and prints its output untagged; on a remote tab it sends `glob-paths` on its own `file-glob` session, rewrites a far-side line to the typed `--path`, maps the containment refusal to `Outside the workspace: <dir>.`, answers an absolute `--path` without a request, prints the ended line when the channel closes, and detaches its session afterwards.
- `src/acp/tool-table.test.ts`: an agent snapshot refuses `file glob **/*` with `Agent: command not permitted: <command>.` with and without the `file` grant, case-insensitively and after a leading slash; `file read` routing is unchanged.
- `src/commands.test.ts` keeps passing with the edited `help/commands.md` row.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, local tab: run `file glob **/*.test.ts --path src/file-read` and confirm a sorted list of root-relative test paths under `src/file-read/`. Run `file glob * --dirs --path src --limit 5` and confirm five `src/<name>/` lines plus the truncation line. Run `file glob nothing-matches-this` and confirm `(no matches)`. Run `file glob *.ts --path missing` and confirm `Directory not found: missing.`

## Out of scope

The ACP vocabulary, role grants, tool table primer and extraction, and the two loop `runWorkspace` branches are subplan 8. Completion is subplan 9. `file glob` for `agent` runs, a web UI beyond transcript output, and per-pattern authorization are out of scope for the whole feature.
