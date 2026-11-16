# Document the expected-failure fallback and remote notification exception in the provider reference page

**Complexity: 1/10** — a docs-only correction with no production lines, files, requirements, scenarios, or new units (p=1.578).

## Goal

`documentation/developer-documentation/web-search-providers.md` must tell a provider author what happens after a `ProviderRequestError`, what an explicit provider prints when that expected failure occurs, how an abort differs, and where the disabled-provider notification appears.

Its "Validation and failure" section currently says only that an expected failure "never disables the provider". A reader cannot tell whether an `auto` search falls back or whether the search ends there, and an explicit `--provider` author is never told that the attempt prints the single `Web search failed (<id>): <reason>.` line. The plugin-failure paragraph also says "one notification appears" without qualifying that to a local search that supplies `reportDisabled`; it never says a remote search passes no callback, so no notification appears there and the reason reaches the reader only in failure lines.

## Issue

Recorded on PR #2010's branch backlog, severity 3/10:

> The page says an expected `ProviderRequestError` never disables but never says an auto search falls back to the next configured provider, and it says one notification appears without noting that a remote search passes no `reportDisabled` and shows the reason only in failure lines.

Verified against the plans that own the behavior:

- `./product/plans/complete/web-search-6-search-core.md` — `'failed'` and `'plugin-failed'` outcomes both record `{ name, reason }` and continue to the next manifest. An explicit `--provider` has a one-manifest list, so it never falls back. The failure lines are `Web search failed (<name>): <reason>.` for one attempt and the `Web search: every provider failed.` list for more than one.
- `./product/plans/complete/web-search-5-provider-registry.md` and `./product/plans/complete/web-search-7-remote-operation.md` — the registry calls the caller's optional `reportDisabled` once per disabled provider. The local typed path supplies a callback that posts the notification. The far-side remote operation passes no `reportDisabled`, so the reason appears only in failure lines because that machine has no notifications tab.
- `src/web-search/registry.ts` — `classifyFailure` returns `{ kind: 'failed', reason: error.message }` for a `ProviderRequestError` and never calls `disable`; the abort check runs before that classification.

## Approach

Edit only the "Validation and failure" section of the page:

1. Extend the expected-failure paragraph with what follows the throw. The failure is recorded with its message as the reason; an `auto` search moves on to the next configured provider; an explicit `--provider` tries only that provider, so its expected failure prints one `Web search failed (<id>): <reason>.` line.
2. Keep the abort rule explicit. An abort is a cancellation that stops the search and never falls back to the next provider, whatever the rejection is.
3. Qualify the notification sentence to a local search that supplies `reportDisabled`, and add the remote exception: a remote search passes no `reportDisabled`, so no notification appears and the reason is visible only in the failure lines.

Then re-read the finished section and compare each claim with `src/web-search/registry.ts`, `./product/plans/complete/web-search-6-search-core.md`, and `./product/plans/complete/web-search-7-remote-operation.md`.

## Design decisions

- **Keep the expected-failure rule about classification, and add only its consequences.** The paragraph already defines which error class is expected. The missing facts are what the core does with the outcome and what an explicit provider prints, so the edit names those rather than redefining the error.
- **Say "recorded" before "moves to the next provider".** The core records `{ name, reason }` so the final failure lines can carry the reason. A reader who only sees "falls back" could think the failure is discarded.
- **State that an explicit provider never falls back.** The page's Resolution section already says an explicit `--provider` selects that one provider, but a provider author reading only "Validation and failure" needs the consequence at the point the failure is defined.
- **Keep the abort rule where it is and make the no-fallback consequence explicit.** The existing sentence says the host "stops rather than falling back"; the edit names the search as what stops and says it applies whatever the rejection is, so a provider author cannot read an abort as a failure that moves on.
- **Qualify the notification by its callback, not by "typed command".** The page's subject is the provider contract; `reportDisabled` is the actual seam. Saying "a local search that supplies `reportDisabled`" keeps the page accurate for both the local typed command and a local agent search.
- **Name the remote side's limitation as the reason.** "No notification" alone could read as a bug. The plan's rule is that the far-side process has no notifications tab, so the reason stays in the failure lines.
- **No source or test change.** The behavior is already pinned by the registry tests and the search-core plan's test list. The gap is only that the page does not describe it.

## Proposed changes

Only `documentation/developer-documentation/web-search-providers.md` changes. In "Validation and failure":

- **Expected failure paragraph** — after the error-class rule and before the abort sentence:

  ```markdown
  The failure is recorded with its message as the reason. An `auto` search then moves on to the next configured provider, while an explicit `--provider` tries only that provider, so its expected failure prints a single `Web search failed (<id>): <reason>.` line.
  ```

- **Abort sentence** — keep the abort never disabling, and make the stop explicit:

  ```markdown
  An abort never disables either: when `capability.signal.aborted` is true, whatever the rejection is, the attempt is a cancellation and the search stops rather than falling back to the next provider.
  ```

- **Notification sentence** — replace "and one notification appears" in the plugin-failure paragraph with a local qualification and add the remote exception:

  ```markdown
  A local search that supplies `reportDisabled` posts one notification: `Web search provider "<id>" disabled: <reason>.` Repeat failures keep the first reason and post no second notification. A search on a remote machine passes no `reportDisabled`, so no notification appears there and the reason reaches the reader only in the failure lines. Nothing re-enables a provider except a server restart.
  ```

No source, test, config, or user-documentation change is needed.

## Tests

No automated test covers page prose, and this fix changes no code. The existing `src/web-search/registry.test.ts` must keep passing unchanged; it already pins the classification this page describes:

- A `ProviderRequestError` is a `'failed'` outcome with its message as the reason, never disables, and never calls `reportDisabled`.
- A plugin failure still disables and calls `reportDisabled` exactly once.
- A rejection while the signal is aborted is `'aborted'`, even when it is a `ProviderRequestError`, and neither disables nor reports.

Verify the prose by reading it:

- The expected-failure paragraph says the failure is recorded, `auto` falls back, and an explicit provider prints one failure line.
- The abort sentence says the search stops rather than falling back.
- The notification sentence is qualified by `reportDisabled`, and the remote exception says no notification appears and the reason is only in failure lines.

## Verification

- `$janissary/scripts/run.mjs check-diff` (docs-only; no source or test change).
- Run `src/web-search/registry.test.ts` through that command and confirm the classification tests still pass.
- Re-read "Validation and failure" and compare every claim with `src/web-search/registry.ts` and the search-core and remote-operation plans.

## Spec

No `./product/specs/` update. This corrects a developer reference page without changing behavior, and the web search behavior spec is still deferred to `./product/plans/ready/web-search-10-typed-command.md`, as `./product/plans/complete/web-search-provider-page-token-row.md` records.

## Out of scope

- Changing `src/web-search/registry.ts`, `src/web-search/search.ts`, or their tests.
- Changing the registry's fallback or `reportDisabled` behavior; neither exists to change in this slice.
- The other recorded entry on the branch backlog: activation failures that throw `ProviderRequestError`.
- Documenting the every-provider-failed list beyond what "Resolution and ordering" already says.
- Updating `help/` or `documentation/user-documentation/`; neither describes provider failure classification.
- Writing a web search behavior spec ahead of `./product/plans/ready/web-search-10-typed-command.md`.
