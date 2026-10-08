# Move the question panel into `web/src/shared/questions/`

## Complexity

3/10 — four file moves and six import-path retargets, no logic changes, no new architecture.

## Goal

`web/src/QuestionPanel.tsx` sits in the flat app-shell root, and `web/src/shared/acp/AcpResponseScope.tsx` imports it with `../../QuestionPanel` — the shared layer reaching up into the app shell, which §3 of the React organization guidelines forbids (shared imports nothing from features or the app shell). The dialog is genuinely shared: the app shell composes it through `MountedViewLayers.tsx`, and the shared ACP response scope renders it into every tab plugin's response surface through `web/src/plugins/api.ts`'s `useAcpResponse`. Move the panel and its one-consumer helper into a shared `questions/` subdirectory so the shared layer stops reaching up, and the first feature import the root dialog ever grows cannot land inside `shared/` unseen by the `no-restricted-paths` feature zones.

## Approach

Move `web/src/QuestionPanel.tsx` and `web/src/useAnswerButtons.ts`, each with its colocated test, into a new `web/src/shared/questions/` directory, keeping both file names. Retarget the depth-relative specifiers inside the moved files; the two modules import each other, so that specifier is unchanged. Retarget the three other value importers. The `QuestionPanelHandle` type stays in `web/src/shared/tab/handles.ts`, which does not move, so its seven readers need no edit. The `import-x/no-restricted-paths` shared zone already targets the whole `web/src/shared` directory, so the move needs no eslint change, and the moved files import only the root `ws` client type and shared siblings — never a feature — so the zone stays satisfied.

## Implementation

1. `mkdir -p web/src/shared/questions`, then `git mv web/src/QuestionPanel.tsx web/src/shared/questions/QuestionPanel.tsx`, `git mv web/src/QuestionPanel.test.tsx web/src/shared/questions/QuestionPanel.test.tsx`, `git mv web/src/useAnswerButtons.ts web/src/shared/questions/useAnswerButtons.ts`, and `git mv web/src/useAnswerButtons.test.ts web/src/shared/questions/useAnswerButtons.test.ts`.
2. In the moved `web/src/shared/questions/QuestionPanel.tsx`, retarget `./ws` to `../../ws`, `./shared/ModalDialog` to `../ModalDialog`, and `./shared/tab/handles` to `../tab/handles`. The `./useAnswerButtons` specifier stays as it is because the two files move together, and the `@shared/protocol` alias is depth-independent.
3. In the moved `web/src/shared/questions/QuestionPanel.test.tsx`, retarget `./ws` to `../../ws` and `./shared/tab/handles` to `../tab/handles`; the `./QuestionPanel` specifier stays. `useAnswerButtons.test.ts` imports only `./useAnswerButtons` and needs no edit.
4. Retarget the three other importers: `web/src/MountedViewLayers.tsx` (`./QuestionPanel` becomes `./shared/questions/QuestionPanel`), `web/src/shared/acp/AcqResponseScope.tsx` (`../../QuestionPanel` becomes `../questions/QuestionPanel`), and `web/src/useSectionNav.question.test.tsx` (`./QuestionPanel` becomes `./shared/questions/QuestionPanel`).
5. Run `./scripts/run.mjs check-diff` after the moves and again after the import retargets.

## Tests

No new tests. The behavior this move must preserve is already pinned by the two suites that travel with the sources — `web/src/shared/questions/QuestionPanel.test.tsx` (the cancel-button focus contract, the option-row cycling, the non-modal contract, the imperative handle) and `web/src/shared/questions/useAnswerButtons.test.ts` (the roving-focus arithmetic) — plus `web/src/useSectionNav.question.test.tsx`, which retargets only and must keep passing unchanged. All three must pass from their new locations with no edits beyond the import paths above.

## Out of scope

- Renaming either moved file, or moving the `QuestionPanelHandle` type out of `web/src/shared/tab/handles.ts`.
- Adding a new ESLint zone that would also forbid shared modules importing the app-shell root; the existing zones already cover the feature boundaries this move protects.
- Touching `web/src/ws.ts`, `web/src/shared/ModalDialog.tsx`, or any other imported module.
- Any change to the panel's rendering, props, or keyboard behavior.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A repository-wide search for `QuestionPanel` finds no remaining root-relative import (`./QuestionPanel` or `../../QuestionPanel`) under `web/src`.
- `web/src/shared/acp/AcqResponseScope.tsx` no longer reaches above `web/src/shared/` for a value import.

## Documentation and specification impact

None. This is a behavior-preserving source-layout refactor; nothing a user can observe changes, so no spec, `help.md`, or user documentation update is needed. `product/specs/agent-questions.md` describes the panel's behavior, which is unchanged.
