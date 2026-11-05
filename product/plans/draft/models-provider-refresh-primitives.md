# Model provider refresh primitives

**Complexity: 5/10** — three provider adapters, provider-specific synchronization, and exact refresh summaries have enough parsing and ordering edge cases to warrant a separate pure-and-I/O layer.

## Goal

Implement the provider fetchers and pure catalog merge, grouping, and refresh-summary functions that the catalog manager will use. This subplan adds no runtime refresh trigger or persistent write path.

## Decisions and dependencies

- Depends on `models-catalog-records.md` for the model-record contract.
- Provider results are `ok` with records, `skipped` with a reason, or `failed` with a reason. Fetchers do not mutate the catalog.
- Fetch all providers concurrently with a 30-second timeout. `opencode` and `codex` use `execFile` with an abort signal; Anthropic uses `fetch` with the refresh signal combined with a 30-second timeout.
- `opencode models` contributes every `<provider>/<model>` line. `codex debug models` contributes only records whose `visibility` is `list`, mapping `slug` to id and `display_name` to name. Anthropic uses `GET https://api.anthropic.com/v1/models`, `ANTHROPIC_API_KEY`, `x-api-key`, and `anthropic-version: 2023-06-01`; follow `after_id` until `has_more` is false. No key skips Claude. A missing CLI is a skip; a timeout is a failure reported as `timed out after 30 s.`.
- Merge syncs only reached providers. Opencode syncs each reported prefix and preserves catalog prefixes that were not reported, because an unconfigured provider is not evidence that its models disappeared.
- Keep pure merge and presentation helpers independent of filesystem, network, and UI code. Use direct imports and keep every source file under the 200-line limit.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Record type and catalog shape | `src/models/catalog-file.ts` from the preceding subplan |
| Process execution conventions | Existing `execFile` usage in `src/` |
| Refresh table ordering and labels | Sessions tab behavior in `product/specs/sessions-tab.md` and the exact model-specific decisions in `product/plans/ready/models-tab.md` |

## Proposed changes

1. Add `src/models/providers/opencode.ts`, `codex.ts`, and `anthropic.ts`. Parse `opencode models` one id per line; parse `codex debug models` JSON and keep only entries with `visibility: "list"`; page the Anthropic Models API using `after_id`, the configured API key, and the specified version header. Treat missing binaries and a missing key as skips, and non-success responses, malformed output, and timeouts as failures with useful one-line reasons.
2. Add `src/models/merge.ts`. Replace records only for reached providers, retain flags for ids still listed, replace fetched names, append new ids in fetched order, and drop ids no longer listed by a reached provider. Preserve unreached harnesses and unreported opencode prefixes. Return the merged catalog and added/removed counts per harness.
3. Add `src/models/groups.ts`. Build the visible provider groups in catalog order, omit hidden rows, retain the disabled marker, fill a missing name from the id, and apply these headings: `claude` → `Anthropic`, `codex` → `OpenAI`, and opencode prefixes `opencode` → `OpenCode Zen`, `opencode-go` → `OpenCode Go`, `google` → `Google`, `openai` → `OpenAI`; show other prefixes raw and keep an opencode id without `/` under the raw `opencode` heading. The OpenAI groups remain distinct by Harness column. Build the refresh notification sentence exactly as the source plan specifies: successful harnesses first in `claude`, `codex`, `opencode` order, visible count after merge, then nonzero added/removed counts; omit zero counts and empty parentheses. Follow with skipped/failed outcomes and unreported opencode prefixes, ending each clause with a period. A timeout reads `failed: timed out after 30 s.`, a missing CLI reads `skipped: <binary> is not installed.`, no key reads `skipped: ANTHROPIC_API_KEY is not set.`, and no reached harnesses starts `Models not refreshed:`.
4. Add colocated provider tests and `src/models/merge.test.ts` and `groups.test.ts`. Inject process and fetch functions so tests do not call real provider services. Cover opencode line parsing, codex JSON and visibility filtering, Anthropic paging across two pages, missing-key/binary skips, non-2xx and timeout failures, merge flags and counts, dropping stale ids only for reached providers, unreported opencode prefixes, group order and labels, hidden and disabled records, and every summary-line shape (all reached, partial skips, timeout, and none reached).

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Provider tests must use injected seams and make no network or installed-CLI assumption.

## Out of scope

- A manager, file write, message-bus emission, or notification delivery.
- UI behavior, role editing, or documentation outside the provider and model-catalog specs already covered by other subplans.
- Fetching Google or OpenCode Go through any source other than `opencode models`.
