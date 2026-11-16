# Correct the description's remote-token verification note

**Complexity: 1/10** — no production code, no production files edited, no test scenarios (p=1.58).

## Goal

The pull request body's closing "Cannot be exercised in a browser" paragraph says a remote-tab search's results are "served by the remote's own `tavily-token`". That contradicts the merged-token rule the help page and the remote-server spec already state. `searchWebInTab` sends the near side's project tokens on the provisioning frame (`src/remote/entry-factory.ts`), `provisionRemoteWorkspace` builds `{ ...own, ...forwarded }` (`src/remote/serve-provision.ts`), and the far-side `web-search` operation runs with that merged map. With the documented Setup's local `~/.janissary/tavily-token`, the forwarded value wins and the remote's own file is only the fallback.

The delivered behavior is correct; only the description's claim about which credential answered is wrong.

## Approach

Change no source, test, spec, or help file. Rewrite only the parenthetical in the closing description paragraph so it says the remote search uses the workspace's merged tokens, where a token forwarded from this machine wins over the remote's own `tavily-token`, which serves as the fallback when no local token file exists. Preserve every other sentence in that paragraph — including the every-provider-failed timeout-line claim — and every other paragraph and the title byte-for-byte.

The claim is checked against these paths:

- `src/web-search/tab-search.ts` — `searchWebInTab` chooses `searchRemote` for a remote tab, and `searchRemote` calls `port.webSearch(parsed)`; the near side does not search locally.
- `src/remote/entry-factory.ts` — a provision frame carries `tokens: getProjectTokens()`, the initiating machine's tokens.
- `src/remote/serve-provision.ts` — `const tokens = { ...own, ...forwarded }`, with the comment stating forwarded wins and the remote's own file is the fallback.
- `src/remote/serve-file-navigator.ts` and `src/remote/filesystem/web-search-operation.ts` — the operation context holds the merged tokens, and `run` passes `tokens: context.tokens` to `webSearch`.
- `help/web.md` (Tokens) — "A remote tab uses its workspace's tokens, where a token forwarded from the local machine wins over a file on the remote machine."
- `product/specs/remote-server.md` (version 44) — "The far side runs it with the merged token set of the workspace it serves, forwarded tokens winning over the remote's own files."
- `product/plans/complete/web-search.md` (manual remote check) — the check requires the remote to demonstrate its own key only "with no local token file", which is exactly the fallback case.

## Design decisions

1. **The fix is a description correction, not a behavior change.** Forwarding wins by design so a remote workspace can search with the credentials the person already configured locally. The code, tests, help page, and spec agree; only the pull request body diverges.

2. **One parenthetical changes.** The disputed clause is the remote-tab example in the closing paragraph. Rewrite only that clause to name the merged tokens, the forwarded-wins rule, and the remote file's fallback role. The timeout-line clause and every other sentence stay exactly as written.

3. **The correction is applied after the push.** A description is live on GitHub while a file edit is not; editing earlier would leave the pull request describing work that is not yet on its branch. The plan file and the backlog removal are committed and pushed first, then the body is rewritten with `gh pr edit --body-file ./temp/pr-body.md`.

4. **No pointers in the published body.** The code paths and docs above are the verification trail for this plan; the pull request body keeps its reviewer-facing prose and does not gain internal file paths it did not already carry.

5. **The title and the rest of the body are untouched.** `gh pr edit` replaces the body wholesale, so the saved body is edited surgically and checked before it is applied. The entry's scope names only this parenthetical.

## Implementation steps

1. Verify the disputed claim against `src/web-search/tab-search.ts`, `src/remote/entry-factory.ts`, `src/remote/serve-provision.ts`, `src/remote/serve-file-navigator.ts`, and `src/remote/filesystem/web-search-operation.ts`: confirm the near side forwards its tokens, the far side merges them with its own files, and the search operation reads the merged map.
2. Verify the wording in the Tokens section of `help/web.md` and the version-44 paragraph of `product/specs/remote-server.md`. Confirm the manual remote check in `product/plans/complete/web-search.md` demonstrates the remote's own key only with no local token file.
3. Run `$janissary/scripts/run.mjs check-diff`; markdown-only changes scope nothing to lint, typecheck, or test and must exit 0.
4. Move the plan to `product/plans/complete/`, remove the resolved entry from `product/backlog/pull-request.md`, commit both, and push to `feature/web-search`.
5. Read the live body with `gh pr view <reference> --json body`, rewrite the one parenthetical, write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`.
6. Diff the published body against the previous body: only the one parenthetical may differ, and the title must be untouched.

## Tests

No automated tests. The change is prose in a pull request description plus the plan and backlog files, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the file changes; markdown changes are lint-only or produce no tools, and the command must exit 0.

Manual verification: read the revised parenthetical against the five code paths and three documents named above, and confirm the sentence no longer claims the remote's own file supplies the results in the documented Setup, where a local `~/.janissary/tavily-token` is forwarded.

## Out of scope

- Changing `src/web-search/`, the remote provisioning or filesystem operations, or any provider behavior.
- Changing `product/specs/remote-server.md`, `product/specs/web-search.md`, `help/web.md`, or the canonical `product/plans/complete/web-search.md`.
- Changing the pull request title or any other description paragraph.
- Resolving the other entries in `product/backlog/pull-request.md`.
