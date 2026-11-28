# Add the choose kind, choice fields, and the shared custom-answer label

**Complexity: 2/10** — ~15 added lines, 2 files, 6 requirements (p=4.05)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. No subplan dependencies; this is the additive protocol step the client form and server validator build on.

## Goal

The wire contract and the shared vocabulary need to describe a single-choice question before either the client form or the server validator can be written. This subplan adds the `choose` kind, an exported choice shape with an optional description, the two optional fields on the pending-question and request types, and the one reserved-label constant shared by server validation and the web panel. Nothing here is consumed by a runtime path yet, so the tree stays green and no existing behavior changes.

## Requirements

1. "Include a caller-specified default selection." — the wire types carry an optional default label so a caller can name one; the preselection behavior lands in `single-select-multiple-choice-question-4-choice-form.md`.
2. Extend `QuestionKind` with `'choose'` so a question can be identified as a single-choice question.
3. Export a `QuestionChoice` type with a `label` and an optional `description`.
4. Carry an ordered `choices` list on `PendingQuestionView` and `QuestionRequest`, present only for `choose`.
5. Carry an optional `defaultOption` label on `PendingQuestionView` and `QuestionRequest`, present only when supplied.
6. Export `CUSTOM_ANSWER_LABEL = 'Type your own answer'` from one shared module so the validator and the web panel use the same string.

## Design decisions

- Keep `options?: string[]` on both types approve-only and never set it for `choose`. Existing approve consumers therefore do not change.
- All four additions are additive: a new union member, two optional fields, a new exported type, and a new exported constant. No existing field is removed or narrowed, so no production consumer breaks and no three-step add/migrate/remove transition is needed; a single additive step is green on its own (Assumption 1, Assumption 2).
- Put the constant in `src/shared/question-choice.ts`, a pure module that imports nothing server-only, so the client can import it at runtime through `@shared/shared/question-choice` the way `web/src/shared/command-availability.ts` imports `@shared/shared/command-matching` (Assumption 3).
- `validateChoiceRequest` joins that same module in `single-select-multiple-choice-question-6-choice-validator.md`; this step creates the module with the constant only.
- The constant stays the single source of the reserved label; neither the validator nor the form hard-codes the words.

## Preserved behavior

None found. The additions are optional fields and a new union member; no existing value's meaning changes and no existing test is affected.

## Assumptions

1. `src/protocol/tab.ts:65` declares `export type QuestionKind = 'ask' | 'approve';` and `:66` declares `PendingQuestionView` with only `id`, `tab`, `kind`, `question`, and `options?: string[]`. Quote: `export type QuestionKind = 'ask' | 'approve';`.
2. `src/questions.ts:5` declares `QuestionRequest` with `tab`, `kind`, `question`, and `options?: string[]`. Quote: `export type QuestionRequest = {`.
3. `web/src/shared/command-availability.ts:2` imports a runtime value from `src/shared/` as `@shared/shared/command-matching`. Quote: `@shared/shared/command-matching`.
4. `src/protocol.ts:134` re-exports `QuestionKind` and `PendingQuestionView` from `./protocol/tab.js`, so the client sees the new shape through `@shared/protocol` with no separate edit. Quote: `PendingQuestionView,`.
5. `web/src/shared/questions/QuestionPanel.tsx:2` imports `PendingQuestionView` from `@shared/protocol`, so a client consumer already resolves through the shared alias. Quote: `import type { PendingQuestionView } from '@shared/protocol';`.
6. All three alias declarations already map `@shared/*` to `src/*`, so the new runtime module resolves for typechecking, the production build, and tests without a config edit. Quotes: `web/tsconfig.json:14` `"@shared/*": ["../src/*"]`; `web/vite.config.ts:51` `'@shared': fileURLToPath(new URL('../src', import.meta.url))`; `vitest.config.ts:73` `'@shared': fileURLToPath(new URL('src', import.meta.url))`.

## Existing functionality

1. `src/protocol/tab.ts:66` provides `PendingQuestionView`, the projection to extend rather than mirroring a new type in the web app.
2. `src/questions.ts:5` provides `QuestionRequest`, the request type to extend.
3. `src/protocol.ts:134` provides the single re-export point through which the client receives wire types.
4. `web/src/shared/command-availability.ts:2` provides the precedent for importing a runtime value from `src/shared/` over the `@shared` alias.

## Implementation steps

1. In `src/protocol/tab.ts`, add `'choose'` to `QuestionKind`, export `QuestionChoice = { label: string; description?: string }`, and add `choices?: QuestionChoice[]` and `defaultOption?: string` to `PendingQuestionView`. Describe in prose that `choices` is present only for `choose` and `defaultOption` only when supplied; do not add code examples. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. In `src/questions.ts`, add `choices?: QuestionChoice[]` and `defaultOption?: string` to `QuestionRequest`, importing `QuestionChoice` as a type from `./protocol/tab.js`. Do not yet change `pendingFor` or `answer`; those carry-through edits are `single-select-multiple-choice-question-7-questions-carry-through.md`. Spread the new fields through unchanged by the existing `register` entry construction. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. Add `src/shared/question-choice.ts` exporting only `CUSTOM_ANSWER_LABEL` set to `Type your own answer`, with no imports and no other exports yet. Confirm the three `@shared` alias declarations resolve the new module for client runtime imports by reading `web/tsconfig.json`, `web/vite.config.ts`, and the `client` project in `vitest.config.ts`; no edit to them is needed because they already map `@shared/*` to `src/shared/*`. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

No step leaves a compile error for a later subplan to fix.

## UI design

1. No user-visible surface changes in this step. The reserved label string becomes available to the panel for the choice form in `single-select-multiple-choice-question-4-choice-form.md`.

## Tests

- This step adds a type and a constant only; no new test is needed. `npm run typecheck:diff` and the existing question tests must stay green, confirming the additive fields break no consumer.
- No test of documentation is introduced.

## Out of scope

- Runtime validation, command grammar, tool schema changes, and the client choice form.
- Removing or narrowing `options?: string[]`.
- Changing the reserved label's wording anywhere else.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read `src/protocol/tab.ts` and `src/questions.ts` and confirm `QuestionKind` contains `choose`, `QuestionChoice` is exported with `label` and optional `description`, both `choices` and `defaultOption` are optional on `PendingQuestionView` and `QuestionRequest`, and `options` is unchanged and still documented as approve-only. Read `src/shared/question-choice.ts` and confirm it exports only `CUSTOM_ANSWER_LABEL` with the exact text `Type your own answer`. A missing field, a narrowed `options`, or a second hard-coded copy of the label is a failure.
