# Web fetch 7 — per-attempt timeout in the provider HTTP helper

**Complexity: 4/10** — ~20 added lines across 3 files, 6 requirements, 8 test scenarios (p=5.03)

Run order: 7 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "HTTP helper" bullet under "Provider contract, registry, and catalog", the "`--timeout`" decision, and the `timed out after <s> s` reason in "Failure and refusal lines"). Depends on `product/plans/ready/web-fetch-1-rename-web-directory.md`, which moves the helper to `src/web/providers/http.ts` and the two search providers beside it. It doesn't depend on subplans 2 to 6 and touches none of their code. Subplan 2 switches `tavily.ts` and `tinyfish.ts` to `satisfies WebSearchProvider`, which doesn't affect the `search` bodies edited here, so the two land in either order.

A fetch's `--timeout` runs up to 120 seconds, while a search keeps its fixed 30. The shared JSON request helper reads the fixed `PROVIDER_TIMEOUT_MS` today, so it can't serve a fetch. This plan makes the helper take the timeout per attempt. Search keeps passing 30 seconds, so no search line changes. Nothing calls the helper with another value until subplans 8 and 9.

Paths below are the post-rename ones. Today the helper is `src/web-search/providers/http.ts` (51 lines): `TIMEOUT_REASON` (`:4`, `const TIMEOUT_REASON = 'timed out after 30 s';`), `requestJson` (`:6`), its signal expression (`:11`–`13`), `send` (`:26`), `readText` (`:39`), and `classify` (`:47`). Its only callers are `search` in `src/web-search/providers/tavily.ts:9` and `src/web-search/providers/tinyfish.ts:11`. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Per-attempt timeout (source plan, HTTP helper).** `requestJson(capability, url, init, timeoutMs)` takes the timeout in milliseconds as a new required fourth parameter, a `number`, instead of reading `PROVIDER_TIMEOUT_MS`. There is no default value, so a caller that forgets it fails typecheck rather than silently waiting 30 seconds. Subplans 8 and 9 pass their `WebFetchRequest`'s `timeoutMs` here.
- **Timeout reason.** A timeout's reason is `timed out after <s> s`, where `<s>` is `timeoutMs / 1000` in JavaScript's default number formatting. Every caller passes a whole number of seconds times 1000 (search 30000, fetch its `--timeout` of 1 to 120 times 1000, per subplans 13 and 15), so the division is exact and no rounding is added. Delete the `TIMEOUT_REASON` constant and build the reason inside the classifier. No separate reason helper is added.
- **Attempt signal, extracted for reuse.** Move the signal expression out of `requestJson` into a new module-level function in `http.ts`, `attemptSignal(capability, timeoutMs)`. It returns `AbortSignal.any` of `capability.signal` and `AbortSignal.timeout(timeoutMs)` when the capability has a signal, and `AbortSignal.timeout(timeoutMs)` alone when it doesn't, exactly the two branches it has today. `requestJson` calls it once per request.
- **Classifier, renamed and given the timeout.** Rename `classify` to `classifyRequestError(signal, error, timeoutMs)`. Its three cases keep their order:
  - when `signal?.aborted` is true, it returns the error unchanged, so the runner sees an abort and disables nothing;
  - when `isTimeout(error)` is true, it returns `ProviderRequestError` with the reason above;
  - otherwise it returns `ProviderRequestError` with `firstLine(error)`.
  The `signal` argument is always the caller's `capability.signal`, never the joined attempt signal. The joined signal is aborted by the timeout too, so passing it would turn every timeout into a pass-through abort. `send` and `readText` each gain a `timeoutMs` parameter and hand it to the classifier along with `capability.signal`, as they hand `capability.signal` to `classify` today.
- **Shape for subplan 11.** Subplan 11's `local` provider reuses the attempt signal and the classifier for one signal across its whole attempt. So both stay plain module-level functions with the signatures above and no dependency on `requestJson`'s locals. This plan doesn't export them, because nothing outside `http.ts` uses them yet. Subplan 11 adds `export` to `attemptSignal` and `classifyRequestError` unchanged.
- **Search unchanged (source plan, HTTP helper).** `search` in `src/web/providers/tavily.ts` and in `src/web/providers/tinyfish.ts` passes `PROVIDER_TIMEOUT_MS` (30000) as the fourth argument, importing it from `../../models/providers/result.js`, the module `http.ts` imports it from today. So every search line is unchanged, `timed out after 30 s` included. `http.ts` drops `PROVIDER_TIMEOUT_MS` from its import and keeps `firstLine` and `isTimeout`.
- **Everything else stays.** The helper still does four things:
  - joins `capability.signal` with `AbortSignal.timeout`;
  - maps a non-2xx status to `HTTP <status> <status text>`, trimmed to `HTTP <status>` when the text is empty, before reading the body;
  - maps an undecodable body to `invalid response` and a network failure to its first line;
  - lets an abort pass through untouched.
- **Strings that stay 30 seconds.** These keep their literal `30 s` and are not edited:
  - the `ProviderRequestError` comment in `src/web/providers/contract.ts` (today `src/web-search/contract.ts:64`), whose `timed out after 30 s` is still a valid search example;
  - the Models tab's reasons in `commandFailure` (`src/models/providers/result.ts:36`) and `src/models/providers/anthropic.ts:21`, which are a separate feature's 30-second budget;
  - `product/specs/web-search.md:45` and `help/web.md:38`, because search still times out at 30 seconds. Subplan 21 writes the fetch spec.
- **One change.** `http.ts`, both providers, and `http.test.ts` land together, since typecheck is red between the signature change and the two calls. `http.ts` ends near 55 lines, far under the 200-line limit.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| JSON request helper | `requestJson`, `send`, `readText`, `classify` in `src/web/providers/http.ts` | Gains the parameter; signal and classifier factored out |
| Timeout and error helpers | `PROVIDER_TIMEOUT_MS`, `isTimeout`, `firstLine` in `src/models/providers/result.ts` | Search's 30 s and classification, unchanged |
| Expected-failure type | `ProviderRequestError` in `src/web/providers/contract.ts` | Carries the reason, unchanged |

## Proposed changes

- `src/web/providers/http.ts`: the `timeoutMs` parameter on `requestJson`, `send`, and `readText`; the new `attemptSignal`; `classify` renamed to `classifyRequestError` with the computed reason; `TIMEOUT_REASON` and the `PROVIDER_TIMEOUT_MS` import removed.
- `src/web/providers/tavily.ts` and `tinyfish.ts`: import `PROVIDER_TIMEOUT_MS` and pass it from `search`.

## Tests

- `src/web/providers/http.test.ts`:
  - all 13 existing `requestJson` calls pass `PROVIDER_TIMEOUT_MS`, imported from `../../models/providers/result.js`, as the fourth argument. The two existing `timed out after 30 s` cases ("classifies a timeout rejection" and "classifies a body read timeout as a timeout rather than an invalid response") keep their expectation, and every other case is unchanged;
  - a `TimeoutError` rejection from `fetch` with a 45000 ms timeout reports `timed out after 45 s`;
  - a `TimeoutError` from the body read with a 45000 ms timeout reports `timed out after 45 s`, which catches a `readText` that doesn't receive the timeout;
  - with a capability signal that never aborts and a 10 ms timeout, a stub `fetch` that rejects with its received signal's `reason` once that signal aborts gives a `ProviderRequestError` reading `timed out after 0.01 s`. This proves the parameter reaches `AbortSignal.timeout` and that the classifier reads the caller's signal, not the joined one;
  - the same real-timeout case with no capability signal.
  The real-timeout cases use real timers and a 10 ms timeout, so no global spy or fake clock is needed.
- `src/web/providers/tavily.test.ts` and `tinyfish.test.ts` stay unedited. Their "reports a timeout" cases (today `tavily.test.ts:115` and `tinyfish.test.ts:86`) still expect `timed out after 30 s`, which pins that `search` passes 30000.
- `src/web/search/search.test.ts` stays unedited. Its `timed out after 30 s` is a stubbed reason, not the helper's.

## Out of scope

- Any fetch implementation, including passing a fetch timeout (subplans 8 and 9).
- Exporting `attemptSignal` and `classifyRequestError`, and the `local` provider that uses them (subplan 11).
- The Models tab's own `timed out after 30 s` reasons in `src/models/providers/`.

## Documentation

`documentation/developer-documentation/web-search-providers.md`, the paragraph that begins "The 30-second budget is per attempt." (today line 180; subplan 1 has already changed its path to `src/web/providers/http.ts`). Say that `requestJson` joins `capability.signal` with the timeout its caller passes in milliseconds, and turns a timeout into `timed out after <s> s` naming that timeout in seconds. Add that search passes `PROVIDER_TIMEOUT_MS`, 30 seconds, so a search timeout reads `timed out after 30 s`. Keep the paragraph's other sentences. Subplan 12 documents the fetch capability.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web` so the provider and search suites run even where `--changed` would skip them. Confirm `grep -rn TIMEOUT_REASON src/web` finds nothing, and `grep -rln PROVIDER_TIMEOUT_MS src/web` lists only `tavily.ts`, `tinyfish.ts`, and `http.test.ts`. In a shell tab, `web search vitest` prints exactly what it printed before.
