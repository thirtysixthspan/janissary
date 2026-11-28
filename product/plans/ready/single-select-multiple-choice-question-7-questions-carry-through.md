# Carry choice fields through the pending-question queue and accept nonblank answers

**Complexity: 3/10** — ~25 added lines, 1 file, 5 scenarios (p=4.37)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. Depends on `single-select-multiple-choice-question-3-protocol-and-shared-label.md` for the `QuestionRequest` fields.

## Goal

The question manager holds one pending question per tab and queues the rest. A `choose` request must survive that queue with its choices and default intact so the client can render it, and its answer must be any nonblank string rather than a checked label. This subplan makes those server-core changes. It does not produce a `choose` question yet — no command or tool does — so it is green on its own.

## Requirements

1. Project `choices` and `defaultOption` through `pendingFor` so the client receives them on the pending view.
2. Carry `choices` and `defaultOption` into the queued entry, so a later question promoted off the queue still renders correctly.
3. Accept a `choose` answer when `answer.trim() !== ''`, and refuse it (return `false`, leaving the question open) otherwise.
4. Do not trim the answer or check it against the listed labels on the server.

## Design decisions

- No edit to `register` is needed: it already spreads the request into the queued entry, and `QueuedQuestion` intersects `QuestionRequest`, so the two fields travel with it automatically (Assumption 1). The only edits are to the explicit `pendingFor` projection and the `answer` check.
- Add the `choose` nonblank check beside the existing `approve` membership check in `answer`. Keep the approve check exactly as it is, including its refusal of a label that was not offered (Preserved 12 is pinned in `src/commands/question.test.ts` and is not edited here). Approval answers continue to be checked; choice answers are only checked for nonblank text (Assumption 2).
- Keep the string-only `answerQuestion` RPC: `src/client-params/core.ts` already accepts any string, so no protocol or RPC change is needed (Assumption 3).
- The server holds no selection state. The client's choice form owns selection and typed text, so there is nothing to add to the queue beyond the request fields.

## Preserved behavior

1. Cancel returns the cancellation result and must not submit an answer; `src/questions.test.ts` "reports cancellation to the waiting agent". The `answer` and `cancelTab` paths keep returning `QUESTION_CANCELLED` through the same `finish` call.
2. A second question on the same tab waits and must not replace the active question; `src/questions.test.ts` "holds a second question until the first resolves". The queue promotion path gains two fields but keeps its order and timing.
3. Closing a tab resolves active and queued questions and must not leave callers waiting; `src/questions.test.ts` "resolves active and queued questions when their tab closes". `cancelTab` and `closeTab` are unchanged.

## Assumptions

1. `src/questions.ts:12` declares `type QueuedQuestion = QuestionRequest & { id: string; resolve: …; cleanup?: () => void }`. Quote: `type QueuedQuestion = QuestionRequest & {`.
2. `src/questions.ts:61` validates approve answers with `if (answer !== null && entry.kind === 'approve' && !entry.options?.includes(answer)) return false;`. Quote: `entry.kind === 'approve' && !entry.options?.includes(answer)`.
3. `src/protocol/core-rpc.ts:34` defines `answerQuestion` with `answer: string | null`, and `src/client-params/core.ts` already accepts any string. Quote: `answer: string | null`.
4. `src/questions.ts:3` defines `QUESTION_CANCELLED = 'Question cancelled.'`. Quote: `export const QUESTION_CANCELLED`.
5. `src/questions.ts:46` builds the pending view explicitly from the active entry. Quote: `pendingFor(tab: string): PendingQuestionView | undefined`.

## Existing functionality

1. `src/questions.ts:25` provides `register`, the single entry that copies a request into the queue.
2. `src/questions.ts:46` provides `pendingFor`, the single projection to the client.
3. `src/questions.ts:58` provides `answer`, the single validation point for both approve and choice answers.
4. `src/questions.ts:66` provides `cancelTab`, reused by closing and shutdown, which the change leaves untouched.

## Implementation steps

1. In `src/questions.ts`, extend `pendingFor` to include `choices: entry.choices` and `defaultOption: entry.defaultOption` on the returned view. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. In `src/questions.ts`, extend the `answer` method with the `choose` nonblank check using `answer.trim() !== ''`, placed beside the approve check and returning `false` without finishing when it fails. Do not trim the stored answer. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. In `src/questions.test.ts`, add: a `pendingFor` assertion that `choices` and `defaultOption` are projected; a `choose` answer that is blank or whitespace-only being refused while the question stays open; and a nonblank string that is not one of the labels being accepted. Keep the three named preservation tests passing untouched. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Each step is green at its own commit.

## UI design

1. No user-visible surface changes. The projected fields are what the choice form from `single-select-multiple-choice-question-4-choice-form.md` consumes; the nonblank check keeps the panel open when the client sends an empty answer.

## Tests

- `src/questions.test.ts`: requirement 1 and 2 via the `pendingFor` projection, requirement 3 via the blank/whitespace and non-label acceptance cases, requirement 4 via the untrimmed answer assertion.
- Preserved behaviors 1, 2 and 3: the named tests in the same file continue to pass unchanged.

## Out of scope

- Producing a `choose` question from a command or tool, which later subplans do.
- Persisting choice state across tab switches or server restarts.
- Changing approve validation, the RPC shape, or any error text.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read `src/questions.ts` and confirm `pendingFor` emits `choices` and `defaultOption`, the queued entry retains both through the existing spread, and `answer` refuses a whitespace-only `choose` answer while accepting any nonblank string verbatim. A projection that drops the fields, a trimmed answer, or an approve check that now accepts an unoffered label is a failure.
