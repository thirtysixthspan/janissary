# Rename `harness-models.json` to `known-models.json` and confirm its claude, opencode, and OpenAI models

**Complexity: 2/10** — a file rename, a handful of path strings and one sandbox param field, a new catalog guard test, and wording in specs and docs. No behavior changes beyond the file name.

Per the backlog: "update the list of models in harness-models.json to include claude, opencode and openai models. rename the file to known-models.json and any code or tests that use the old name."

## Approach

**The model list already covers all three families.** The bundled catalog holds a `claude` list (Anthropic), a `codex` list (OpenAI's GPT models, the ones the codex harness runs), and an `opencode` list spanning OpenCode Zen, OpenCode Go, and Google. Every model id the repo's defaults reference is already present: the `planning` role's `gpt-6-sol` and `claude-opus-5-5`, the `ask` role's `opencode-go/deepseek-v4.1-flash`, `claude-haiku-4-5`, and `gpt-6-luna`, and the ACP agent's `google/gemini-3.1-flash-lite`. A scan of every tracked file for claude, GPT, and provider-prefixed ids found nothing else that names a live model missing from the catalog. The leftovers are test fixtures (`claude-sonnet-4-20250514`, `gpt-6-mini`, `anthropic/…`, `openai/test`) and `opencode/deepseek-v4-flash-free`, which the earlier refresh removed on evidence it's gone from OpenCode Zen. So the list's contents stay as they are; the catalog's existing order and shape are kept. What this change adds is a guard so it stays that way: a test that every model a default role names is in the bundled catalog.

**The rename covers both copies of the name.** The bundled file moves to `known-models.json` at the repo root. A project override mirrors the bundled name (as `.janissary/agent-names.json` mirrors `agent-names.json`), so it moves to `.janissary/known-models.json` too, along with the two stderr warnings that name it and the `Unknown model … — add it to known-models.json.` refusal. The sandboxed browser profile grants read access to the bundled file by path, so that path and its `appHarnessModels` field (now `appKnownModels`) follow. `package.json`'s `files` list ships it under the new name.

Function names such as `loadHarnessModels` and `modelsFor` describe the concept, not the file, and stay.

## Implementation steps

1. `git mv harness-models.json known-models.json`; update the import in `src/harness/models.ts` and the `package.json` `files` entry.
2. `src/harness/models.ts` — read the override from `.janissary/known-models.json` and name that path in both warnings; update the comment.
3. `src/harness/manager.ts` — the unknown-model refusal names `known-models.json`; update the comment.
4. `src/plugins/context.ts` — update the comment naming the override.
5. `src/sandbox/browser/profile.ts`, `src/sandbox/browser/spawn.ts` — rename `appHarnessModels` to `appKnownModels` and point it at `known-models.json`.
6. Tests: `src/harness/models.test.ts`, `src/harness/manager.test.ts`, `src/sandbox/browser/profile.test.ts` — update names and paths.

## Tests

- `src/harness/models.test.ts` (updated): override files are written to `.janissary/known-models.json`; the warnings assert the new path. Add a case proving a file left at the old `.janissary/harness-models.json` is no longer read.
- `src/harness/manager.test.ts` (updated): the refusal names `known-models.json`.
- `src/sandbox/browser/profile.test.ts` (updated): the browser profile still grants read access to the bundled catalog at its new path.
- `src/harness/models.test.ts` (new cases, beside the other bundled-catalog guards): every entry of every default role names a model in the bundled catalog for its harness.

Run `$janissary/scripts/run.mjs check-diff`.

## Specs and docs

- `product/specs/harness.md` — the refusal message, the override path, and in "What the bundled catalog holds" the file name, the three model families, the default-role guarantee, and that the old override name is not read.
- `product/specs/roles.md` — the catalog file names.
- `product/specs/cli.md` — the warning list names the known-models file.
- `documentation/user-documentation/advanced-agents/harness.md` — the refusal message and the override path.
- `documentation/developer-documentation/tab-plugins.md` — the override path `harnessLaunchCatalog()` reflects.

## Out of scope

- **Adding or removing model ids.** Nothing in the repo names a current model the catalog lacks. A provider-sourced refresh is its own chore.
- **Reading the old override name as a fallback.** The override is read once at startup and the refusal message names the new file, so a project with an old override sees the bundled catalog and the correct name to move it to.
- **Historical records.** `CHANGELOG.md` and completed plans keep the old name.
- **Renaming `loadHarnessModels`, `decodeHarnessModels`, `modelsFor`.** They name the harness-model concept, not the file.
