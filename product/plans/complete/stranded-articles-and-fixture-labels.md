# Give every stranded article and fixture label a tab kind that exists

## Complexity

4/10 — thirty-odd comment sentences across twenty-five files and one fixture label in two suites. No logic changes anywhere; the only way to get it wrong is to pick the wrong noun, so each sentence is read before it is edited.

## Goal

The rename that removed agent tabs left the definite article stranded: `an tab` appears thirty-two times across twenty-five production and test files, and the tab label `'agent'` survives as a fixture label in `src/file-navigator/open.test.ts` and `src/file-navigator/operation-report.test.ts`. Prose that used to read "an agent tab's command pipeline" now reads "an tab's command pipeline", and `src/plugins/line-capabilities.ts` — the module that decides which tab a line capability may change — says "a plugin tab is not an tab", which no reader can recover a meaning from.

## Approach

Replace each `an tab` with the tab kind its sentence actually means, read from the sentence and its neighbours rather than substituted wholesale: most are `a shell tab` (the launch shell's transcript, its persistent shell, its command bar), several are `a plugin tab` (the tab kind that never records, the bar that records global history), and the ones contrasting a metadata row or a command bar against the harness tab's become `a harness tab`. Fix the one sentence that also still says "the agent tab" (`shell-capabilities.test.ts`) so the whole sentence names a kind the code has. Then rename the fixture label `'agent'` to `'shell'` in the two suites, every occurrence — the `makeManagers` default, the nine overrides, and the assertions that read the label back — because the label is a lookup key and a partial rename turns a passing suite red.

## Implementation

1. In the production files — `src/schedule/manager.ts`, `src/plugins/line-capabilities.ts` (both occurrences), `src/plugins/shell/activate.ts`, `src/tab/types.ts`, `src/tab/root-tab-test-fixture.ts`, `src/sandbox/index.ts`, `src/remote/serve-processes.ts`, `src/remote/protocol-frames.ts`, `web/src/plugins/shell/ShellTabMeta.tsx`, `web/src/plugins/api.ts`, `web/src/plugins/PluginChords.tsx` (plus the "agent beside it" half of the same sentence), `web/src/plugins/conversations/ConversationComposer.tsx` (both occurrences), `web/src/harness/HarnessTabMeta.tsx`, and `web/src/useWindowKeys.ts` — replace `an tab` with the kind the sentence means.
2. In the test files — `src/schedule/manager.test.ts` (both), `src/plugins/shell-capabilities.test.ts` (both, including the "falls back to the agent tab" clause), `src/tab/manager.test.ts` (all three), `src/tab/view.test.ts`, `src/tab/placement.test.ts`, `web/src/plugins/shell/ShellTab.test.tsx`, `web/src/shared/command-bar/AppCommandBar.test.tsx`, `web/src/useWindowKeys.test.ts` (both), `web/src/App.launch-focus.test.tsx`, and `web/src/ViewTabBody.test.tsx` — do the same.
3. Rename the fixture label `'agent'` to `'shell'` throughout `src/file-navigator/open.test.ts` and `src/file-navigator/operation-report.test.ts`.
4. Run `./scripts/run.mjs check-diff` after the production files, after the test files, and after the label rename.

## Tests

No new tests. `src/file-navigator/open.test.ts`, `src/file-navigator/operation-report.test.ts`, and `src/plugins/shell-capabilities.test.ts` are the suites whose content the label rename touches; they must pass with the same assertions, now reading the label `'shell'`. Every other edit is comment text, which no suite executes.

## Out of scope

- Any `an tab` that is not a stranded article — there are none, but "than tab" false positives are left alone.
- Other references to agent tabs beyond the one clause named above; the entry lists exactly which sentence carries a second stray noun.
- Renaming any label other than `'agent'`, or touching the tabs the fixtures build beyond their label.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A search for `an tab` across `src/` and `web/src/` finds nothing, and a search for `'agent'` in the two fixture files finds nothing.
- Each replaced sentence reads as a whole sentence naming a tab kind the code has — the check is reading the diff, not a count.

## Documentation and specification impact

None. These are comments and test fixture labels; no spec, `help.md`, or user documentation quotes them.
