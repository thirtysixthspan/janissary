# Model provider refresh primitives

**Complexity: 5/10** — three provider adapters, provider-specific synchronization, and exact refresh summaries have enough parsing and ordering edge cases to warrant a separate pure-and-I/O layer.

## Goal

Implement the provider fetchers and pure catalog merge, grouping, and refresh-summary functions that the catalog manager will use. This subplan adds no runtime refresh trigger or persistent write path.

## Decisions and dependencies

- Depends on `product/plans/complete/models-catalog-records.md` for `ModelRecord` and `ModelCatalog`.
- Put the shared provider outcome in `src/models/providers/result.ts`. Its `status` is `ok` with records, `skipped` with a reason, or `failed` with a reason. Each fetcher returns the full result or a skip/failure; it never returns partial records or mutates the catalog.
- Export `fetchOpenCodeModels`, `fetchCodexModels`, and `fetchAnthropicModels`. Each accepts the refresh `AbortSignal` and a narrow injected process or fetch function; production defaults use `execFile` or global `fetch`. The manager calls all three concurrently. Give each source one 30-second deadline: pass both `signal` and `timeout: 30_000` to `execFile`, and combine the refresh signal with `AbortSignal.timeout(30_000)` for Anthropic so its deadline covers the whole pagination sequence.
- A missing CLI (`ENOENT`) is a skip; other process errors fail. Keep `execFile`'s default bounded output buffer for these listing commands; an output-limit error fails the whole provider, and truncated output is never merged. A missing or empty `ANTHROPIC_API_KEY` skips Claude. Non-2xx HTTP responses, invalid JSON or response shapes, duplicate provider ids, and pagination that cannot advance fail that provider without returning its partial list. Include the HTTP status in HTTP failure reasons. Store one-line outcome reasons without terminal punctuation; the summary uses the first line of a failure reason and adds exactly one final period. The timeout reason is `timed out after 30 s`.
- `opencode models` contributes every nonempty model-id line after trimming whitespace; blank lines are ignored. A line with `/` must have a nonempty prefix and model suffix; a bare id is kept and belongs to the raw `opencode` group. Sync each reported prefix only. A successful empty output reaches no OpenCode prefix, so it preserves all existing prefixes and does not by itself count as a reached harness. If the command fails or is skipped, no prefix is reported as unconfigured.
- `codex debug models` contributes only entries with `visibility: "list"`, mapping `slug` to id and `display_name` to name. Anthropic uses `GET https://api.anthropic.com/v1/models`, `ANTHROPIC_API_KEY`, `x-api-key`, and `anthropic-version: 2023-06-01`; send no `after_id` on the first request, then use each page's `last_id` as the next request's `after_id` until `has_more` is false. Require a nonempty, previously unseen `last_id` whenever `has_more` is true.
- `mergeModelCatalog` syncs only reached providers. Claude and Codex are reached when their fetch result is `ok`, including an empty list. OpenCode reaches each reported prefix independently. Within a reached provider, keep listed ids in existing catalog order, preserve their flags, replace their name with the fetched name (clearing it when the source has none), drop stale ids, then append new ids in fetched order. For OpenCode, append a new prefix after existing records; preserve an unreported prefix unchanged and return it for the summary. Return the merged catalog, per-harness added/removed id counts, reached harnesses, and unreported OpenCode prefixes. OpenCode counts aggregate its reached prefixes; its visible count is over the whole merged OpenCode harness, including preserved prefixes.
- `groupModelCatalog` omits hidden rows and groups emptied by that filter, retains the disabled marker, and uses the model id when `name` is absent. Preserve catalog order: Claude, Codex, then OpenCode prefixes by first appearance. Headings are `claude` → `Anthropic`, `codex` → `OpenAI`, and OpenCode `opencode` → `OpenCode Zen`, `opencode-go` → `OpenCode Go`, `google` → `Google`, `openai` → `OpenAI`; show other prefixes raw, and use raw `opencode` for a bare id. The two `OpenAI` groups remain distinct by harness.
- `summarizeModelRefresh` returns the exact one-line sentence from `product/plans/ready/models-tab.md:50` (`Refresh reports to the notifications feed`). Reached harnesses come first in `claude`, `codex`, `opencode` order; show each harness's visible count after merge, then nonzero added and removed id counts as `(+n −n)`. Omit zero deltas and empty parentheses. Then list skipped/failed harness outcomes in that order, using the first error line, followed by unreported OpenCode prefixes in catalog order. End each clause with a period; use the exact no-key, missing-CLI, timeout, and unconfigured-prefix text in the canonical plan. Start with `Models refreshed:` if any harness was reached and `Models not refreshed:` otherwise. This helper formats text only; notification delivery stays in the manager.
- Keep merge, grouping, and summary helpers pure and independent of filesystem, network, and UI code. Use direct imports with `.js` relative extensions in `src/`, no barrel module, and keep every source file under the 200-line limit.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Record type and catalog shape | `ModelRecord` and `ModelCatalog` in `src/models/catalog-file.ts:6,13`, delivered by `product/plans/complete/models-catalog-records.md` |
| Process execution and cancellation | `runGit` in `src/git/run.ts:11` uses `promisify(execFile)` with `signal` and `timeout`; its injected process seam is tested in `src/git/run.test.ts:46` |
| Provider, merge, group, and summary decisions | `product/plans/ready/models-tab.md:21` (`Groups and their heading names`), `product/plans/ready/models-tab.md:44` (`all sources run concurrently`), `product/plans/ready/models-tab.md:48` (`merge syncs per provider`), and `product/plans/ready/models-tab.md:50` (`Refresh reports to the notifications feed`) |

## Proposed changes

1. Add `src/models/providers/result.ts`, `src/models/providers/opencode.ts`, `codex.ts`, and `anthropic.ts`. Implement the exported fetchers and shared result contract above. Validate complete provider responses before returning `ok`; keep injected process/fetch seams so tests never invoke installed CLIs or the network.
2. Add `src/models/merge.ts` with `mergeModelCatalog`. Apply the ordering, flag/name, reached-prefix, and count rules above; never mutate its input catalog.
3. Add `src/models/groups.ts` with `groupModelCatalog` and `summarizeModelRefresh`. Apply the canonical provider headings and exact sentence grammar above, including the distinction between an OpenCode command that is unreachable and a successful command that reports no prefixes.
4. Add colocated `src/models/providers/*.test.ts`, `src/models/merge.test.ts`, and `src/models/groups.test.ts`. Cover OpenCode bare and prefixed ids, invalid ids and duplicates; Codex JSON validation and visibility filtering; Anthropic two-page `last_id` → `after_id` flow, missing key, malformed cursor, non-2xx, and timeout; missing CLI and other process errors; injected seams; merge order, name clearing, flags, counts, reached/unreached and empty OpenCode results; group order/labels, hidden and disabled records; and every summary shape, including exact error text and unconfigured-prefix ordering.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Provider tests use injected seams and make no network or installed-CLI assumption. For a manual smoke check, use a scratch project to call each fetcher available on the machine, pass the three outcomes through `mergeModelCatalog` and `groupModelCatalog`, and inspect the returned summary for the documented ordering and counts; confirm this subplan creates no override file. The manager subplan owns the app-level refresh and persistence check.

## Out of scope

- A manager, file write, message-bus emission, or notification delivery.
- UI behavior, role editing, or documentation outside the provider and model-catalog specs already covered by other subplans.
- Fetching Google or OpenCode Go through any source other than `opencode models`.
