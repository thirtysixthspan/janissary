# Recognize Codex usage-limit banners with account links

**Complexity: 1/10** — the existing Codex detector already reads the reported banner correctly; pin that exact wording with a regression test and document the accepted variant.

## Goal

Keep Codex auto-resume working when its usage-limit banner includes the Pro upgrade and account-usage links before the reset time.

## Approach

The current Codex pattern searches for `hit your usage limit` followed by `try again at` or `try again in`, so it already ignores the intervening upgrade and purchase text. Add the exact reported banner as a test fixture and state in the harness spec that those links do not affect reset recognition.

## Implementation steps

1. Add a focused assertion in `src/harness/auto-resume.test.ts` for the issue's exact banner and expected 12:33 PM reset.
2. Update `product/specs/harness.md` to describe the Codex banner variant and the reset clause used for scheduling.
3. Remove the resolved issue from `product/backlog/issues.md`.

## Tests

- `src/harness/auto-resume.test.ts`: verify the exact reported Codex banner parses to `{ kind: 'at', time: { hour: 12, minute: 33 } }`.
- Run `./scripts/run.mjs check-diff`.

## Documentation

- `product/specs/harness.md`: document Codex upgrade and purchase links preceding the recognized reset clause.
- No `help.md` or public documentation update is needed because the user-facing behavior is unchanged and those pages do not describe the exact banner wording.

## Out of scope

- Changing the existing Codex detector or its reset parsing, which already handles the reported banner.
- Changing auto-resume behavior for other Codex banner variants.
