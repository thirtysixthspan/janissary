# Repair launcher contract fixtures

**Complexity: 3/10** — align test fixtures with published host contracts and make the intended ID collision real.

Several launcher tests build values that production cannot provide: activity entries omit required revisions, intent requests use `tabLabel` instead of `tab`, the ACP fake omits its session identity, and the no-question activity fake returns `null`. The command-id test's explicit id currently does not collide with the generated id.

## Goal

Make these regressions exercise the actual host contracts and assert the behavior their names describe.

## Approach

1. Add numeric activity revisions and typed intent request fixtures using the published `TabPluginIntent` shape.
2. Give the ACP fake one stable session identity and assert that it is primed once across two flushes that both have changed transcripts.
3. Make the activity fake return `undefined` for absent questions and assert an ordinary row does not need input.
4. Put an explicit `command-1` at index zero and an unnamed entry at index one; assert the explicit id survives and generated ids remain unique.

## Tests

- `src/plugins/launcher/activate.test.ts`: faithful rows and requests, plus one priming across changed transcript flushes.
- `src/plugins/activity.test.ts`: production-shaped no-question result and idle `needsInput` state.
- `src/plugins/launcher/commands-file.test.ts`: a real positional-id collision preserves both unique rows.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing production activity, ACP, or command-id behavior.
- Updating functional specs, since this repair changes tests and fixtures only.
