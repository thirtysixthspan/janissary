# Refresh the bundled harness model catalog

**Complexity: 3/10** — a data file, the two documentation sentences that describe it, and a rule written down so the next refresh is not a judgment call again. No code changes.

`harness-models.json` is the bundled catalog `--model` is validated against, and — for the `claude` and `opencode` harnesses — the list the conversation tab's model picker is built from. It has drifted. `codex` still offers `gpt-5.4-mini`, which retired from Codex on 31 August 2026; the `opencode` list is missing every model each of its three providers has shipped since it was last touched, still names two OpenCode Zen free models that no longer exist, and names Google models under `-preview` ids that have since gone stable. Meanwhile the `claude` list omits four models that are current and selectable.

Two things follow from what the file is *for*, and they pull in opposite directions:

- **As a validation allow-list**, a missing model is the expensive mistake. `--model <valid model>` gets rejected with `Unknown model … — add it to harness-models.json.` and no tab opens, and the user has to hand-write an override file to use a model that works. A *stale* entry is cheap by comparison: validation passes and the harness reports the provider's own error.
- **As the conversation picker's menu**, an entry that cannot hold a conversation is a visible defect — the row is selectable and fails on the first query.

So: be reluctant to remove (only on positive evidence a model is gone), and decline to add anything that cannot serve as a harness or conversation model in the first place.

## Approach

**Provider sources, recorded so the next refresh repeats rather than re-derives.** `claude` from Anthropic's current model list; `codex` from the Codex models documentation, which also names retirement dates; the `opencode` entries from each of the three providers that harness reaches — OpenCode Zen, OpenCode Go, and Google AI direct — with Google's own API model list preferred over any aggregator, since an aggregator omitted two models (`gemini-3.5-flash`, `gemini-3.1-pro-preview`) that Google still lists.

**Conversational models only.** The `opencode` list currently carries `gemini-embedding-001` and two `-preview-tts` ids. An embedding model and a text-to-speech model cannot answer a prompt, and because `availableConversationModels()` builds the conversation tab's picker from this list, each is an offered choice that fails the moment it is chosen. Embedding, text-to-speech, transcription, live-audio, image-generation, and video/music-generation models come out and stay out. This is the one removal not justified by a model disappearing — it is justified by the model never having belonged.

**Keep the `opencode` list's existing curation rather than flattening it.** The three providers are treated differently today and deliberately: OpenCode Zen contributes its free tier (plus `big-pickle`), while OpenCode Go and Google contribute in full. That is not an oversight — Zen's paid catalog is 60-odd models that mostly re-expose models reachable more directly elsewhere, and listing them would triple the conversation picker to no benefit. The refresh keeps the rule and updates the membership.

**`gpt-5.4-mini` is the only entry removed for retirement with a date behind it.** The two OpenCode Zen free models that vanished (`deepseek-v4-flash-free`, `north-mini-code-free`) are removed on the weaker evidence of absence from the provider's own current catalog, which for a proxy is the best evidence available; a rotating free tier is exactly where that churn is expected.

**Both spellings of Haiku 4.5 stay.** The catalog holds the dated `claude-haiku-4-5-20251001` today; the alias `claude-haiku-4-5` is what current documentation tells people to write. Both are valid strings for the same model, and dropping the dated one would reject a profile that already pins it — a duplicate row in the picker is the smaller cost. Noted in the spec so it reads as a decision rather than an oversight.

## Implementation steps

1. `harness-models.json` — rewrite all three lists:
   - **claude**: add `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`, and the `claude-haiku-4-5` alias, alongside the four already there.
   - **codex**: add `gpt-5.6-sol` and `gpt-5.3-codex-spark`; remove `gpt-5.4-mini` (retired 2026-08-31).
   - **opencode**, OpenCode Zen free tier: add `ling-3.0-flash-fin-free`, `muse-spark-1.2-contributor-free`, `muse-spark-1.3-contributor-free`, `nemotron-3.5-lightning-free`; remove `deepseek-v4-flash-free` and `north-mini-code-free`.
   - **opencode**, OpenCode Go: add the thirteen models added since the last refresh.
   - **opencode**, Google: add the current Gemini and Gemma chat models; correct `gemini-3-pro-image-preview` and `gemini-3.1-flash-image-preview` to their stable ids only if they are kept — they are not, being image-generation models; remove the embedding, text-to-speech, and image ids per the conversational-models-only rule.
2. `product/specs/harness.md` — say what the bundled catalog is, the rule that decides membership, and where each list comes from; drop the stale "currently only opencode's and claude's catalogs are populated" clause, which has been wrong since codex was populated.
3. `documentation/user-documentation/advanced-agents/harness.md` — same stale clause, same fix, in the user's register.

## Tests

- `src/harness/models.test.ts` (extended): every id in every list is a nonempty string and unique within its harness — the two ways a hand-edited catalog breaks; no id in the `claude` or `opencode` list matches the non-conversational suffixes the curation rule excludes, so the rule is enforced rather than merely written down; the catalog names exactly the three harnesses the specs describe.
- `src/harness/models.test.ts` (existing): its three membership assertions (`opencode-go/deepseek-v4-pro`, `claude-sonnet-5`, `gpt-5.5`) all name models that survive this refresh and must keep passing unchanged.
- `src/completion/handlers.test.ts` and `src/completion/index.test.ts` (existing, rewritten): three cases drive tab completion against the real catalog and were pinned to it — `claude-op` completing uniquely to `claude-opus-5`, `claude-s` to `claude-sonnet-5`, and the full four-model match list spelled out. All three are correct assertions about completion that only held while the catalog was small, so they break on any refresh rather than on a regression. They are rewritten to survive one: the two single-match cases use `claude-f`, the one prefix that stays unambiguous however many models are added beside it, and the multi-match case derives its expected list from `modelsFor('claude')` instead of restating it. This is in scope because the refresh is what exposes them, and re-pinning them to today's catalog would leave the same trap for the next one.
- `src/acp/manager.test.ts` (existing): `ACP_MODEL` is `google/gemini-3.1-flash-lite`, which stays in the catalog — a refresh that dropped it would break every conversation and every ACP agent tab, so the existing suite is the guard.

## Out of scope

- **Any code change.** `models.ts`, the validation call sites, and the conversation picker all read the catalog generically; nothing about this refresh needs them to change.
- **Automating the refresh.** A script that pulls each provider's catalog would be worth having, but two of the three sources are documentation pages rather than APIs, and the curation rule needs a human either way.
- **Flattening the OpenCode Zen curation** to the full paid catalog — see the Approach note.
- **`.janissary/harness-models.json` overrides.** A project that ships its own catalog replaces the bundled one entirely and is unaffected by this change, by design.
- **The `claude-mythos-5` model.** Real and current, but reachable only through a programme a given user is unlikely to be in; an entry nobody can select is picker noise.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: open a conversation tab and confirm the model picker lists the refreshed pairs under both harness groups and holds no embedding or speech models; launch `harness codex --model gpt-5.6-sol` and confirm the tab opens rather than reporting an unknown model.
