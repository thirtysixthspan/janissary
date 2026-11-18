# Correct the ACP spec's local mutation routing claim

**Complexity: 1/10** — documentation-only single-sentence rewrite in one spec file; no production code, files, new units, or test scenarios (p=2.067).

## Goal

Make the `browser …` far-side routing paragraph in `product/specs/acp.md` describe local-tab file mutations accurately: a local tab mutation enters through `mutateFileInTab`, while only a far-side mutation enters through `runWorkspaceCommandIn`. Keep the claim that typed and agent mutations share one root, one path policy, and one set of messages.

## Approach

The paragraph already distinguishes local from far-side entry for the other three file commands: `file read` goes to `readFileInTab` locally and, on the far side, through `runWorkspaceCommandIn` in `src/acp/workspace-runner.ts` to `readWorkspaceCommand`; `file glob` and `file grep` follow the same shape with `globFilesInTab` and `grepFilesInTab` locally. Its `file write`/`file edit` sentence instead says a mutation "runs through `runWorkspaceCommandIn` to the same mutation service as the typed command, on the local tab or, in a remote-hosted loop, on the remote machine", which falsely attributes the local path to the far-side runner.

The code agrees with the other three sentences, not with that sentence: `runCorePrompt`'s local `host.runWorkspace` in `src/acp/run-prompt.ts` routes a mutation to `mutateFileInTab`, while the far-side loop's host in `src/remote/serve-acp-loop.ts` uses `runWorkspaceCommandIn`, which `src/acp/workspace-runner.ts` routes to `runFileMutation`. The later "File write and edit tools" paragraph already scopes `runWorkspaceCommandIn` to a remote-hosted loop and describes the local session separately.

Rewrite only the `file write`/`file edit` sentence in that paragraph so it mirrors the read/glob/grep sentences: name `mutateFileInTab` for local entry and `runWorkspaceCommandIn` for far-side entry to the same mutation service as the typed command, retaining the shared-root/path-rules/messages clause. No runtime code changes.

## Implementation steps

1. In `product/specs/acp.md`, in the `browser …` far-side routing paragraph, replace the `file write`/`file edit` sentence so local entry names `mutateFileInTab` and far-side entry names `runWorkspaceCommandIn` routing to the same mutation service as the typed command, preserving the clause that typed and agent mutations share one root, one set of path rules, and one set of messages.
2. Run `$janissary/scripts/run.mjs check-diff` and confirm no regressions.

## Tests

None. This is a documentation-only correction with no behavior change; the proposal explicitly notes that no test changes are needed. The existing `src/acp/workspace-runner.test.ts` and `src/remote/serve-acp-loop.test.ts` already cover the local/far-side mutation routing the corrected prose describes and keep passing unchanged.

## Spec updates

`product/specs/acp.md` — rewrite the `file write`/`file edit` sentence in the `browser …` far-side routing paragraph as described above. This edit is the spec update itself.

## Docs

None needed. No `help/` page or `documentation/user-documentation/` page describes this routing detail.

## Out of scope

- Any runtime change to `src/acp/run-prompt.ts`, `src/acp/workspace-runner.ts`, or the remote loop host: both are correct as written.
- The other four file-command sentences, which are already accurate.
- Test changes and PR description changes: the entry names neither.
