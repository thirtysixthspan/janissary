# Correct the description's remote disabled-provider claim

**Complexity: 1/10** — no production code changes, no production files edited, no test scenarios; two facets of one description claim (p=2.35).

## Goal

The pull request body's What section says a provider disabled on a remote search "reports the reason only in its failure lines". That is false. The remote paths pass no `reportDisabled` reporter, and a successful fallback prints only the answering provider's results, so a provider disabled before a later provider succeeds produces no line at all. The plan, `product/specs/web-search.md`, `help/web.md`, and `documentation/developer-documentation/web-search-providers.md` already state the behavior precisely: a provider disabled during a successful remote fallback is reported nowhere, and its stored reason surfaces only in an explicit `--provider` search naming it or in `auto` once every configured provider is already disabled.

## Approach

Change no code, tests, spec, help page, or developer documentation — they already agree with the implementation. Correct only the single sentence in the pull request body's What section that repeats the false claim. Preserve every other paragraph byte-for-byte, and leave the title alone.

The claim is checked against three reporter-less call sites:

- `src/web-search/tab-search.ts` — only the local branch supplies `reportDisabled`; the remote branch calls `port.webSearch(parsed)` and returns the port's text.
- `src/remote/filesystem/web-search-operation.ts` — `run` calls `webSearch(args, { tokens: context.tokens, fetch })` with no `reportDisabled`.
- `src/remote/serve-acp-loop.ts` — `searchWorkspaceCommand` calls `webSearch(parsed, { tokens, fetch: globalThis.fetch, signal })` with no `reportDisabled`.

The precise wording to follow is in `product/specs/web-search.md` (Disabled providers) and `help/web.md` (Providers):

> A remote search posts no notification, because the provider is disabled in the far-side process, and its output also prints only the provider that answered, so a provider disabled before a successful fallback is reported nowhere. A later failure line names a disabled provider only when an explicit search names it, or when `auto` finds every configured provider already disabled.

## Design decisions

1. **The fix is a description correction, not a behavior change.** The remote silence is deliberate: the far side has no notifications tab, and a successful fallback's output carries only the winner's results. The description, not the code, is what diverges.

2. **One sentence changes.** The disputed clause is the final one in the What paragraph about provider failure and disabling. Rewrite that clause to state the reporter-less path, the successful-fallback silence, and the two cases where the stored reason later surfaces. Leave the rest of the paragraph — and every other paragraph — exactly as written.

3. **The correction is applied after the push.** A description is live on GitHub while a file edit is not; editing earlier would leave the pull request describing work that is not yet on its branch. The plan file and the backlog removal are committed and pushed first, then the body is rewritten with `gh pr edit --body-file ./temp/pr-body.md`.

4. **No pointers in the published body.** The three code paths and two docs above are the verification trail for this plan; the pull request body keeps its reviewer-facing prose and does not gain internal file paths it did not already carry. The body's claim is corrected, and the plan records what it was checked against.

## Implementation steps

1. Verify the disputed claim against `src/web-search/tab-search.ts`, `src/remote/filesystem/web-search-operation.ts`, and `src/remote/serve-acp-loop.ts`: confirm only the local branch supplies a disabled-provider reporter, and confirm a successful fallback returns only `renderSearch` output.
2. Verify the precise wording in the Disabled providers section of `product/specs/web-search.md` and the Providers section of `help/web.md`. Confirm `documentation/developer-documentation/web-search-providers.md` agrees.
3. Search the pull request body for any other sentence repeating the claim. The Screenshots paragraph's "notifications feed can show a disabled-provider line" describes the local notification only and stays.
4. Commit the plan file and the backlog entry removal, push to `feature/web-search`, then read the live body with `gh pr view <reference> --json body` and rewrite the one sentence in the What section. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`.
5. Confirm every paragraph other than the corrected sentence is byte-for-byte unchanged and the title is untouched.

## Tests

No automated tests. The change is prose in a pull request description plus the plan and backlog files, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the file changes; markdown changes are lint-only or produce no tools, and the command must exit 0.

Manual verification: read the corrected sentence against the three code paths and the two docs named above, and diff the published body against the previous body to confirm only the one sentence changed.

## Out of scope

- Changing `src/web-search/`, the remote operation, the ACP loop, or any provider behavior.
- Changing `product/specs/web-search.md`, `product/specs/remote-server.md`, `help/web.md`, or the developer documentation. They already describe the silent remote fallback correctly.
- Changing the pull request title or any other description paragraph.
- Resolving the other entries in `product/backlog/pull-request.md`.
