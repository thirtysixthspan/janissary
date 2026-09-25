# Refresh the bundled harness model catalog (September 2026)

**Complexity: 2/10** — a data file, one spec paragraph, and two completion tests that turn out to be pinned to the catalog more tightly than they claim. No production code changes.

Every provider behind `harness-models.json` has shipped since the last refresh (`refresh-harness-model-catalog.md`, 3 September 2026). Anthropic released Claude Fable 5.1 and Claude Opus 5.5. Codex now recommends a GPT-6 family. OpenCode Zen rotated its free tier and OpenCode Go added seven models. Until they're in the catalog, `harness <name> --model <new model>` is refused with `Unknown model … — add it to harness-models.json.` and none of them appear in the conversation tab's model picker.

The refresh follows the two rules the last one wrote into `product/specs/harness.md`: remove only on evidence a model is gone, and add only what can hold a conversation.

## Approach

**Sources, the same ones the last refresh named.** `claude` from Anthropic's models overview; `codex` from the Codex models page; `opencode` from the OpenCode Zen and OpenCode Go docs and Google's Gemini API model list.

**What each source shows against the catalog.**

- **claude** — the current lineup is `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5`, and Haiku 4.5. Fable 5 and Opus 5 moved to "legacy, still available". Add the two new ids; remove nothing.
- **codex** — the page recommends `gpt-6-astra`, `gpt-6-sol`, and `gpt-6-luna`. It no longer lists the `gpt-5.6-*` models or `gpt-5.3-codex-spark` but announces no retirement for any of them. It does announce that `gpt-5.5` retires from ChatGPT sign-in on 14 October 2026, which hasn't happened yet and doesn't apply to API keys. Add the three GPT-6 ids; remove nothing, since absence from a recommendations page isn't evidence a model is gone.
- **opencode, OpenCode Zen free tier** — add `space-bunny-free`, `mimo-v2.6-flash-free`, and `jev-1.13-free`. Remove `muse-spark-1.2-contributor-free`, which is no longer in Zen's catalog. That's the same evidence standard the last refresh applied to departed free models, and the paid `opencode-go/muse-spark-1.2-contributor` stays.
- **opencode, OpenCode Go** — add `grok-4.7`, `gpt-6-luna`, `deepseek-v4.1-flash`, `mimo-v2.6-flash`, `mimo-v2.6-pro`, `minimax-m2.5`, and `space-bunny-free`. Go lists `minimax-m2.5` without any deprecation note, even though Zen deprecates its own copy, so it goes in: a stale entry costs less than a missing one.
- **opencode, Google** — no change. Every chat model Google lists is already present. The new ids on that page are live-audio, text-to-speech, transcription, image, video, music, embedding, robotics, and managed-agent models, all excluded by the conversational-models-only rule.

**Limited-time models are listed like any other.** Both Zen and Go mark several free models as available for a limited time, and `space-bunny-free` shows up under both prefixes. They're real, selectable, and conversational today, and the removal rule already covers them once they're gone. The spec gets one sentence saying so, so the next refresh doesn't have to decide it again.

**The completion tests' "unambiguous prefix" wasn't.** `src/completion/handlers.test.ts` and `src/completion/index.test.ts` type `claude-f` and expect it to complete uniquely to `claude-fable-5`. Their comments say that prefix "stays unambiguous however many models are added beside it". Fable 5.1 breaks it: `claude-f` now matches both Fable ids. The fix is to derive the single-match case from the catalog, just as the multi-match case already does. Pick a catalog model whose id minus its last character matches only itself, type that prefix, and expect the full id back. That holds for any catalog shape, so the next refresh can't break it.

## Implementation steps

1. `harness-models.json` — apply the additions and the one removal above, keeping each list's existing order (claude and codex newest first; each opencode provider group alphabetical).
2. `src/completion/handlers.test.ts` and `src/completion/index.test.ts` — replace the hard-coded `claude-f` → `claude-fable-5` single-match cases with a catalog-derived prefix, and correct the comments that promised `claude-f` would stay unambiguous.
3. `product/specs/harness.md` — in "What the bundled catalog holds", add a sentence saying that models a provider offers for a limited time are listed while the provider lists them.
4. `product/backlog/chores.md` — remove the completed chore's line.

## Tests

- `src/harness/models.test.ts` (existing): the bundled-catalog guards (nonempty trimmed ids, no duplicates, no non-conversational models for `claude`/`opencode`, the ACP agent's `google/gemini-3.1-flash-lite` kept) run over the refreshed lists unchanged. Add membership assertions for one new model per harness: `claude-opus-5-5`, `gpt-6-sol`, and `opencode-go/deepseek-v4.1-flash`.
- `src/completion/handlers.test.ts` and `src/completion/index.test.ts` (rewritten, as above).

Run `./scripts/run.mjs check-diff`.

## Out of scope

- **Code changes.** `models.ts`, validation, and the conversation picker all read the catalog generically.
- **Re-adding older models that are still reachable some other way.** Codex's page says `gpt-5.4` and `gpt-5.4-mini` still work with an API key even though they're retired from ChatGPT sign-in, and Anthropic still serves Claude Opus 4.5 and Sonnet 4.5. This chore is about the latest models. Whether the catalog should cover every reachable legacy model is a separate decision.
- **Claude Mythos 5.1.** It's excluded for the same reason the last refresh gave for Mythos 5: access is by programme only.
- **Google's specialised agent models** (`deep-research-*`, `antigravity-*`, `gemini-2.5-computer-use-*`). They're managed agents or UI automation, not models a harness or the conversation picker can chat with.
- **User documentation.** `documentation/user-documentation/advanced-agents/harness.md` describes the catalog without naming its models, so nothing there changes.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: launch `harness claude --model claude-opus-5-5` and `harness codex --model gpt-6-sol` and confirm each tab opens rather than reporting an unknown model.
