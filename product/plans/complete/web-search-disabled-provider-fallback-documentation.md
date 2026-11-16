# Make the disabled-provider documentation match a successful fallback

**Complexity: 1/10** — a docs-only correction with no production lines, files, requirements, scenarios, or new units (p=1.578).

## Goal

`./product/specs/web-search.md` and `./help/web.md` must state the disabled-provider rule the code actually implements: a local search posts the one notification even when a later provider succeeds, both kinds of search print only the provider that answered, and a remote search posts nothing, so a provider disabled before a successful fallback is reported nowhere until a later failure line names it.

## Issue

Recorded on PR #2010's branch backlog, severity 4/10:

> Correct the plan's promised behavior spec and help page, which claim a disabled provider's failure line always reaches the search output even when a fallback succeeds.

The spec's "Disabled providers" section says the notification "is not added to the tab's transcript, whose search output already carries the failure line". The help page's "Providers" section says a remote search "reports the reason only in its failure lines". Both imply that a disabled provider always has a failure line somewhere.

Verified against the code:

- `src/web-search/search.ts` (`runWebSearch`) returns immediately when an attempt produces `results`, rendering only that provider's results. The accumulated `failures` are dropped, so a provider disabled before a later provider succeeds appears in neither the results nor the search output. A successful search that kept no results is still an answer, so it too prints `No results for "<query>".` instead of the earlier failure.
- `src/web-search/registry.ts` calls `reportDisabled` at the moment a provider is disabled, before the loop moves on. A fallback success does not undo or retract it.
- `src/web-search/tab-search.ts` supplies `reportDisabled` only for a local search, posting `Web search provider "<name>" disabled: <reason>.` through `notify`. A remote search calls `port.webSearch` and passes no callback.
- `src/remote/filesystem/web-search-operation.ts` runs the far-side search with no `reportDisabled`, and the far side has no notifications tab to post to.
- `src/web-search/search.test.ts` pins `auto falls back after … and prints only the winner` and the fallback-with-reporter case; `src/web-search/tab-search.test.ts` pins the one local notification.

A later failure line names a disabled provider only in two situations: an explicit `--provider` naming it prints `Web search failed (<name>): <reason>.`, and `auto` prints the disabled providers' lines when every configured provider is already disabled. An `auto` search that still has an enabled provider left filters the disabled ones out of its attempt list, so a later failure of the remaining provider does not mention them.

## Approach

Rewrite one paragraph in each page, keeping every other paragraph untouched:

1. In `./product/specs/web-search.md`, replace the last paragraph of "Disabled providers" so it says the local notification arrives even when a later provider succeeds, the transcript never repeats it, the search output prints only the answering provider, a remote search posts no notification and also prints only the answer, and a later failure line names the disabled provider only for an explicit search of it or for `auto` with every configured provider disabled.
2. In `./help/web.md`, replace the last paragraph of "Providers" with the same rule in the page's shorter voice, keeping the remote limitation explicit rather than implying a failure line always exists.
3. Re-read both edited paragraphs against `src/web-search/search.ts`, `src/web-search/registry.ts`, `src/web-search/tab-search.ts`, and the two tests named above.

## Design decisions

- **Say what the output prints, not what it "carries".** The previous wording implied the search output always contains the failure line. The code returns the first successful provider's rendered results and discards the failure list, so the page must say the output prints only the answering provider.
- **Keep the notification tied to the local side.** `reportDisabled` is supplied by `searchWebInTab` on a local search only. Saying "a local search" rather than "a typed search" keeps the rule accurate for the ACP tool too, which also calls the search core without a reporter.
- **State the remote gap as a gap.** The far side posts nothing and prints only the winner, so a disable before a successful fallback has no report anywhere. The paragraph must not promise that a failure line will arrive later; it names the two cases that do produce one.
- **Name both situations that surface a disabled provider later.** An explicit search of it and `auto` with no enabled provider left are the only lines that name it. Leaving that vague would repeat the original overclaim in a softer form.
- **No source or test change.** The behavior is already pinned by `src/web-search/search.test.ts` and `src/web-search/tab-search.test.ts`. The defect is only that the two pages describe a different rule.
- **No developer-reference change.** `documentation/developer-documentation/web-search-providers.md` is outside this entry's two named pages and outside the user-facing documentation Step 6 checks; the recorded work is the spec and help page.

## Proposed changes

Only two files change.

- **`./product/specs/web-search.md`, last paragraph of "Disabled providers"** — replace the paragraph with:

  ```markdown
  When a local search disables a provider, one notification, `Web search provider "<name>" disabled: <reason>.`, appears in the notifications tab, attributed to the tab the search ran in (see [[notifications]]), even when a later provider succeeds. It is not added to the tab's transcript, and the search output prints only the provider that answered, so the notification is the only report of the disable when it happens. A remote search posts no notification, because the provider is disabled in the far-side process, and its output also prints only the provider that answered, so a provider disabled before a successful fallback is reported nowhere. A later failure line names a disabled provider only when an explicit search names it, or when `auto` finds every configured provider already disabled.
  ```

- **`./help/web.md`, last paragraph of "Providers"** — replace the paragraph with:

  ```markdown
  A provider that breaks is disabled for the rest of the server process. An explicit search of a disabled provider prints `Web search failed (<name>): <reason>.` without sending anything, and `auto` skips it. On a local tab one notification, `Web search provider "<name>" disabled: <reason>.`, appears in the notifications tab even when a later provider succeeds, and the search output prints only the provider that answered, so that notification is the only report of the disable when it happens. A remote tab posts no notification and also prints only the answering provider, so a provider disabled before a successful fallback is reported nowhere; a later failure line names it only in an explicit search of it, or in `auto` once every configured provider is disabled.
  ```

No source, test, config, or other documentation change.

## Tests

No automated test covers page prose, and this fix changes no code. The existing tests must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`:

- `src/web-search/search.test.ts` — `auto falls back after … and prints only the winner` proves the output omits the earlier failure; `reports a plugin failure once and still falls back without a reporter` proves the reporter fires during a successful fallback.
- `src/web-search/tab-search.test.ts` — `posts one notification when a local search disables a provider` proves the local caller is the one that posts it.

Verify the prose by reading it:

- The spec paragraph says the local notification arrives even on a fallback success, the transcript does not carry it, and the output prints only the answering provider.
- The spec paragraph says a remote search posts nothing and can leave a fallback-covered disable unreported, and it names the two cases where a later failure line does name the provider.
- The help paragraph says the same in its shorter form and does not imply that a failure line always exists.

## Verification

- `$janissary/scripts/run.mjs check-diff` (docs-only; no source or test change).
- Re-read both edited paragraphs beside `src/web-search/search.ts`, `src/web-search/registry.ts`, and `src/web-search/tab-search.ts`.
- Confirm the quoted notification string still matches `src/web-search/tab-search.ts` and `src/web-search/tab-search.test.ts`.

## Spec

`./product/specs/web-search.md` is one of the two files this fix updates; there is no separate spec to write. The correction is in the "Disabled providers" section.

## Out of scope

- Changing `src/web-search/search.ts`, `src/web-search/tab-search.ts`, `src/web-search/registry.ts`, the remote operation, or the remote port.
- Changing the behavior so a far-side fallback success carries the disabled reason over the wire.
- Updating the PR description; the recorded entry calls for no description change.
- Other backlog entries on the branch.
- The completed web-search plans and the developer reference page that repeat the old wording; only the behavior spec and help page named by the entry change.

## Rating basis

lines_added=0, files_edited=0, requirements=0, scenarios=0, new_units=0. Production counts are zero because the only edited files are a spec and a help page. p = 1.578, under the 3.461 threshold for 1.
