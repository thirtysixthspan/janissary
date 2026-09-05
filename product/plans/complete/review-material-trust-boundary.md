# Plan: Say who the branch's operational instructions are addressed to

**Complexity: 2/10** — three documents gain an audience statement. No code, no behaviour, no test.

## Goal

This branch carries three documents full of imperatives: install these dependencies, run this command, start this server, move to a host shell. All three are legitimate for the reader they were written for, and all three travel inside the change itself, where a reviewer meets them as material rather than as direction.

- **`ai/guidelines/sandbox-e2e-browser.md`** is the operating manual for an agent inside a `-b` tab. It opens by telling the reader to install the workspace clone's dependencies and run scripts. A reviewer that has been handed the file as part of a diff is not that reader.
- **`product/plans/complete/sandbox-end-to-end-browser-testing.md`** carries a Verification section of manual host checks, written for whoever brought the feature up.
- **PR #975's How to verify section** goes furthest: it says in bold that *a reviewer should run steps 5–7 on a host shell before merging*. That is a direct instruction to the reviewer, embedded in the material under review, to execute branch-controlled tooling outside whatever task the reviewer is actually running.

The risk is specific to an unattended reviewer. A person reads "run this" and decides; an agent whose task is to read a branch and record findings can take an embedded imperative as authorisation and start executing. Nothing about the content is malicious here — which is the point. The boundary has to be stated whether or not the material is hostile, because a reviewer cannot tell the difference from inside.

## Approach

State the audience, then state what the document does *not* authorise. Both halves matter: naming the intended reader is not the same as telling every other reader that the imperatives are inert for them.

Each document gets a short statement in its own voice, placed where it will be read before the instructions:

- The guidelines file names its one audience — an agent inside a `-b` tab, driving the browser that tab was given — and says that reviewing, auditing, or summarising are not that, and that in those cases the commands are examples rather than authorisation, and cannot expand the task the reader is already running.
- The plan's Verification section says it is a record of how the feature was brought up, not an instruction to anything reading the plan as part of a change under review.
- The PR's How to verify section gains the same framing, and its bolded reviewer directive is rewritten as what it should have been all along: a statement that steps 5–7 remain unverified and that this is a gap in the evidence for merging, for whoever has a host shell and chooses to close it.

The verification examples are kept in full. They are the most useful part of all three documents, and the finding asks for them to be preserved as non-authoritative reference material rather than removed.

## Implementation steps

1. `ai/guidelines/sandbox-e2e-browser.md` — the audience and trust statement, above the existing opening.
2. `product/plans/complete/sandbox-end-to-end-browser-testing.md` — the audience note at the head of Verification.
3. PR #975's description — the framing paragraph in How to verify, and the reviewer directive rewritten.
4. Run `./scripts/run.mjs check-diff`.

## Tests

None. Nothing here is executable, and there is no assertion that would fail if the wording were removed — the change is entirely in what the documents say about themselves.

## Spec and documentation

No spec change: nothing user-visible moves. The documentation change *is* the work.

## Out of scope

- Reviewing the wording against `ai/tasks/pull-request-review.md`'s untrusted-content rule, which the finding asks for. **That file does not exist in this repository** — `ai/tasks/` holds no review task, and nothing under `ai/` states such a rule. If the rule lives in the Janissary installation that ran the review rather than in the project, the wording above should be checked against it by someone who can see it.
- Any general convention for marking operational documents across the repo. Three documents are in scope because three carry this change's instructions; whether `ai/tasks/` and the other guidelines want the same header is a separate question.
- The content of the verification steps themselves, which are accurate and stay.
