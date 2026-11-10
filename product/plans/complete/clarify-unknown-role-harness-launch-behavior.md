# Clarify unknown role harness launch behavior

**Complexity: 1/10** — no production code, behavioral requirements, test scenarios, or new units change; only the spec and one PR paragraph need factual rewording (p=1.578).

## Goal

Correct the ACP spec and pull request description so they distinguish a harness refused at launch today from a future harness that has an ACP adapter but no deny-all internal-tool configuration.

## Approach

Keep runtime behavior unchanged. `acpLaunchForEntry` returns no launch for harnesses outside the supported adapter set, so those entries fail before the permission-request denial can run. Describe the second-layer-only case conditionally: it applies if a harness later gains an ACP adapter without a deny-all entry in `internalToolDenial`.

## Implementation steps

1. Reword the role-connection paragraph in `product/specs/acp.md` to state that unsupported harnesses are refused at launch today and make the second-layer-only behavior conditional on a future adapter without deny-all configuration.
2. After the repair commit is pushed, make the same distinction in the named paragraph of the PR description, preserving every other paragraph exactly.

## Tests

- Add no tests because runtime behavior does not change. `src/acp/launch.test.ts` already verifies that a harness without an ACP adapter has no launch, and `src/acp/internal-tools.test.ts` verifies that an unknown harness has no internal-tool denial configuration.
- Run `$janissary/scripts/run.mjs check-diff` after each repository change.

## Spec updates

- Update `product/specs/acp.md` with the current launch refusal and conditional future behavior.

## Docs

- No help or user-documentation changes are needed; they do not claim that unsupported harnesses run with only the permission denial.

## Out of scope

- Changing harness launch or internal-tool denial behavior.
- Editing other paragraphs in the PR description or changing the remaining backlog entry.
