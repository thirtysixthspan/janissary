# Model search 1: Tab completion and most-used ranking module

**Complexity: 5/10** — ~55 added lines in one new module, 11 requirements, 15 test scenarios (p=5.27)

Run order: 1 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on nothing.

The series replaces the model `<select>` in the roles tab's **Add model** picker and in the **New harness** dialog with one shared search input. This first step lands the two pure functions every later step builds on: what Tab puts in the input, and which models a blank input lists. Nothing renders them yet. Subplans 4 to 6 build the input on them, and subplans 7 and 11 mount it.

## Goal

Add `web/src/shared/model-search/model-search.ts` with `completeModel` and `mostUsedModels`, plus their unit tests. No existing file changes.

## Design decisions

All of these come from the source plan.

- **Matching reuses the editor's find, unchanged.** Candidates for typed text are exactly what the editor tab's Cmd+F find picks (`product/specs/editor-tab.md`, "Finding a line"): the trimmed text matched as a contiguous, case-insensitive substring by `contiguousMatch` in `web/src/shared/fuzzy-match.ts`. The visible rows are `contiguousMatch(ids, text, 10)`, the call `useLineFind` makes. That matcher already favors characters after the last `/`, so for `opencode-go/deepseek-v4.1-flash` a match in the model name outranks one in the provider prefix, and it already breaks score ties by shorter id, then alphabetical order. This module adds no wrapper for the visible rows; the hook in subplan 4 calls `contiguousMatch` directly.
- **"Exact id" has no helper.** Everywhere in the series, "exact id" means the chosen harness's enabled ids include the trimmed text, case-sensitive, written inline at each host (subplans 7 and 11). This module does not export one.
- **Tab completes the longest common prefix, the command bar's rule** (`product/specs/tab-completion.md`).
  - With exactly one match, Tab replaces the text with that match's full id.
  - With several, Tab replaces the text with the longest common prefix of the matches when that prefix is longer than the trimmed text and still contains the trimmed text case-insensitively. Otherwise Tab leaves the text alone.
- **Tab never widens the list.** The prefix is computed over every match, not only the ten shown, so `completeModel` calls `contiguousMatch(ids, text, ids.length)`. Typing `5` against `claude-opus-5-5` and `claude-sonnet-5-5` gives the prefix `claude-`, which doesn't contain `5`, so nothing is completed. A filled prefix that contains the typed text can never add a candidate, because every id containing the prefix also contains the text.
- **Tab is intercepted only when it would change the text.** `completeModel` returns null when there are no matches (including blank or whitespace-only text, where `contiguousMatch` returns nothing), when the prefix wouldn't narrow, and when its result equals the current input text. The "would change" comparison is against the raw, untrimmed input text, so ` opus` with the single match `opus` completes to `opus`. The "longer than" and "contains" checks use the trimmed text, and "contains" compares the lowercased prefix with the lowercased trimmed text. So `CLAUDE-` against `claude-a` and `claude-b` returns null: the prefix `claude-` is no longer than the text, and Tab never just re-cases what was typed. A single match is the exception the first rule already states: `OPUS` with the single match `opus` returns `opus`.
- **Signatures.** `completeModel(ids: string[], text: string)` returns `string | null`. It reads each result's `path` field from `contiguousMatch`, which is the id. `mostUsedModels(roleEntries, harness: string, ids: string[])` returns `string[]`. Both take `ids` as a mutable `string[]` because `contiguousMatch`'s first parameter is `string[]` and a `readonly string[]` argument would not type-check against it; neither function mutates it. Every host already holds `string[]` here (`LaunchCatalog.models` in `src/plugins/roles/shared.ts`, `HarnessLaunchView.models` in `src/protocol/tab.ts`).
- **The longest common prefix is a client copy (user decision).** A module-private helper in `model-search.ts`, modelled on `longestCommonPrefix` in `src/completion/helpers.ts`: start from the first item and shorten until every item starts with it, case-sensitive. The server file imports `node:fs`, so the client can't import it, and the server stays untouched.
- **"Most used" counts roles (user decision).** `mostUsedModels(roleEntries, harness, ids)` takes one list of `{ harness, model }` pairs per role, in role order. A model's usage is the number of roles holding at least one entry with that harness and model id, so a role listing the same model twice counts once. Both comparisons are exact, case-sensitive string equality. Only ids in `ids` (the chosen harness's enabled models) are eligible, entries for other harnesses are ignored, and a usage of zero isn't "used". Higher usage comes first. Ties keep first-appearance order, reading roles top to bottom and entries in order, counting only eligible entries. Each id appears at most once in the result. At most ten are returned, capped by a module-private constant of 10 in `model-search.ts` (`RESULT_CAP` in `useLineFind.ts` is module-private, so it is neither imported nor exported). The result may be shorter than ten and is never padded from the catalog.
- **The input shape is the function's own contract.** `model-search.ts` exports a type named `HarnessModelPair`, a `{ harness: string; model: string }` pair naming exactly what it reads, and `mostUsedModels` takes `roleEntries` as a readonly list of readonly lists of it. It is not a copy of a wire type: the roles plugin's `RoleEntry` (`src/plugins/roles/shared.ts`) and the launch view's `roleEntries` added in subplan 9 both satisfy it structurally, so neither host maps its data. The module knows nothing else about roles or harness launches (`ai/guidelines/react-code-organization.md` §2).
- **Placement.** `web/src/shared/model-search/` is a shared feature directory because its two real consumers, the roles plugin and the harness launch dialog, are different features that can't import each other (`ai/guidelines/react-code-organization.md` §3). This module is the pure layer in that directory (§8): no React, no DOM.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| Contiguous matcher | `contiguousMatch(paths: string[], query, limit)` in `web/src/shared/fuzzy-match.ts` | Trims and lowercases the query, returns `[]` for blank text, sorts by score, then length, then `localeCompare`; returns `FuzzyMatchResult` objects whose `path` is the candidate |
| Ten-row cap precedent | `RESULT_CAP = 10` in `web/src/shared/line-find/useLineFind.ts` | The same cap the visible rows use; not exported, so this module declares its own |
| Longest common prefix | `longestCommonPrefix` in `src/completion/helpers.ts` | Model for the module-private client copy; not imported |
| Roles' entry shape | `RoleEntry` in `src/plugins/roles/shared.ts` | Has `harness` and `model`, plus optional `effort` and `missing` that this module ignores |

## Proposed changes

- New `web/src/shared/model-search/model-search.ts`:
  - `completeModel(ids, text)` returns the string Tab should put in the input, or null when Tab must not be intercepted, per the decisions above.
  - `mostUsedModels(roleEntries, harness, ids)` returns at most ten of `ids`, ranked per the decisions above.
  - The exported `HarnessModelPair` type, the module-private longest-common-prefix helper, and the module-private cap of 10.
- Keep the file small and import only `contiguousMatch` from `../fuzzy-match`, extensionless like `web/src/shared/line-find/useLineFind.ts` does (the `.js` rule applies to `src/` only). No `index.ts` barrel (`ai/guidelines/imports-and-barrel-files.md`).

Until subplan 4 lands, nothing imports this module, and no host renders anything built on it until subplan 7. `npm run knip` (part of `check:full`, not `check`) may report it as unused in between.

## Tests

`web/src/shared/model-search/model-search.test.ts`, plain function calls with no render. `contiguousMatch` already has its own tests in `web/src/shared/fuzzy-match.test.ts`, so they aren't repeated.

- `completeModel`:
  - A single match returns the full id.
  - Several matches with a narrowing prefix return the prefix, counting every match even beyond ten (a fixture of more than ten ids sharing a prefix, where the eleventh breaks the narrower prefix the first ten share).
  - A prefix that doesn't contain the text (`5` against `claude-opus-5-5` and `claude-sonnet-5-5`) returns null.
  - A prefix no longer than the trimmed text returns null (`CLAUDE-` against `claude-a` and `claude-b`).
  - No matches return null, and blank and whitespace-only text return null.
  - Text already equal to the result returns null (`opus` against the single id `opus`).
  - Untrimmed text whose trimmed form equals the single match completes to it (` opus` against the single id `opus` returns `opus`).
- `mostUsedModels`:
  - Counts roles, not entries (a role listing one model twice counts once).
  - Higher usage ranks first, even for a model that first appears after a less-used one.
  - Ties keep first-appearance order.
  - Only ids in `ids` are returned (an entry for a disabled or unknown id is ignored).
  - Entries for other harnesses are ignored.
  - Zero-use models are excluded, and with nothing used the result is empty.
  - At most ten are returned.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing renders this module yet.

## Out of scope

- Any UI, hook, or style (subplans 2 to 6).
- Any change to `src/completion/helpers.ts` or `web/src/shared/fuzzy-match.ts`.
- Any change to the `roles.json` format or the roles plugin's server side.
- Command-line completion of `harness … --model` (`product/specs/tab-completion.md`), which is unchanged.
