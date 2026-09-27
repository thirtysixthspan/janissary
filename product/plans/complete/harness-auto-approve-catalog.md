# Deliver which harnesses accept auto-approve on the launch dialog's catalog

**Complexity: 3/10**: one new field on an existing wire view, one derived list on the server, and the dialog switching from its own hardcoded set to that field. No new architecture. The refusal messages keep their exact text while the gate table is unchanged.

`supportsHarnessAutoApprove` in `src/harness/auto-approve.ts` is documented as the single source of truth for which harnesses accept `-y`, "so validation cannot drift from the detectors that actually exist". The "New harness" dialog doesn't use it. `web/src/harness/HarnessLaunchDialog.tsx` keeps its own `AUTO_APPROVE_HARNESSES = new Set(['claude', 'codex'])`, commented as a mirror of the server rule, and its checkbox label hardcodes "claude and codex only". The parser's refusal (`src/harness/command-parse.ts`) and the profile opener's refusal (`src/profile/entry-openers.ts`) spell the two names out again. When the gate table grows (an opencode detector is planned), a typed `harness opencode` would auto-approve by default, while the dialog would keep the checkbox disabled and submit `--no-auto-approve`.

## Goal

The server tells the dialog which harnesses accept auto-approve, and every place that names them reads that list from the gate table. That covers the dialog's enablement, its default, its label, and both refusal messages.

## Approach

1. **`src/harness/auto-approve.ts`**: add `autoApproveHarnessNames(): string[]`, which returns `HARNESS_NAMES.filter(supportsHarnessAutoApprove)` so it keeps the catalog order. Add `describeAutoApproveHarnesses(): string`, which formats that list as English prose with `Intl.ListFormat('en', { style: 'long', type: 'conjunction' })`. Today that gives `claude and codex`. `HARNESS_NAMES` comes from `./index.js`, which imports nothing, so this adds no import cycle.
2. **`src/protocol/tab.ts`**: `HarnessLaunchView` becomes `{ names: string[]; models: Record<string, string[]>; autoApprove: string[] }`, and a comment on the new field says it lists the harnesses that accept `-y`.
3. **`src/harness/manager.ts`**: `harnessLaunchView()` fills `autoApprove: autoApproveHarnessNames()`.
4. **`src/harness/command-parse.ts`**: the refusal becomes `` `-y/--yes is only supported for the ${describeAutoApproveHarnesses()} harnesses.` ``, which produces the same text as before.
5. **`src/profile/entry-openers.ts`**: the refusal becomes `` `autoApprove (-y) is only supported for the ${describeAutoApproveHarnesses()} harnesses` ``, which also produces the same text as before. The comment above it stops naming the harnesses.
6. **`web/src/harness/HarnessLaunchDialog.tsx`**: delete `AUTO_APPROVE_HARNESSES` and its mirror comment. `autoApproveSupported(view, name)` reads `view.autoApprove.includes(name)`. `initialFields(view)` computes the default from the view. The `update` callback and `autoApproveEnabled` pass `view`. The checkbox label becomes `Auto-approve (-y) — {list} only`, where `list` is `view.autoApprove` formatted with the same `Intl.ListFormat` call. That is platform list formatting, not a copy of the rule.

## Implementation steps

1. Add the two functions to `src/harness/auto-approve.ts`, and add the field to `HarnessLaunchView` and `harnessLaunchView()`. Run `check-diff`, then fix the typed test fixtures that construct a `HarnessLaunchView` (`web/src/harness/HarnessLaunchDialog.test.tsx`, `web/src/ws.test.ts`, and `web/src/useServerState.test.ts`) by adding the new field.
2. Route both refusal messages through `describeAutoApproveHarnesses()`. Run `check-diff`.
3. Switch the dialog to the delivered list. Run `check-diff`.
4. Add the tests below. Run `check-diff`.

## Tests

- `src/harness/auto-approve.test.ts`: `autoApproveHarnessNames()` returns `['claude', 'codex']` in catalog order, and `describeAutoApproveHarnesses()` returns `'claude and codex'`.
- `src/harness/manager.test.ts`: the open dialog's view carries `autoApprove: ['claude', 'codex']`.
- `web/src/harness/HarnessLaunchDialog.test.tsx`: given a view whose `autoApprove` also lists `opencode`, the dialog enables and defaults the checkbox for opencode, and the label names all three. That shows the dialog reads the delivered list instead of a copy. Given an empty `autoApprove`, the checkbox starts unchecked and disabled.
- These existing cases must keep passing unchanged: the dialog's auto-approve checkbox cases, including the "claude and codex only" label, and the refusal-text assertions in `src/harness/command-parse.test.ts`, `src/harness/index.test.ts`, `src/profile/entry-openers.test.ts`, and `src/profile/agent-opener.test.ts`.

## Spec

`product/specs/harness.md` describes the dialog enabling Auto-approve "unless the selected harness is claude or codex" and quotes the parser's refusal. Both stay accurate while the gate table is unchanged. Add one sentence to the dialog section saying that the dialog offers Auto-approve for exactly the harnesses the `harness` command accepts `-y` for, so the two can't disagree.

## Out of scope

- Adding an opencode gate detector.
- The prose in `product/specs/harness.md`, `help.md`, and code comments that names claude and codex as today's supported set. It describes current behavior, not a copy of the rule.
