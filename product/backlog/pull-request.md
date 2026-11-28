<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Document the choice form's tab-switch focus carve-out where tab-switch focus is described

Existing Issue: Pending `choose` questions now leave tab-switch focus to their own form, but the hook's comment, the tab-handle comment, and the agent-questions spec still say a pending question's Cancel button receives focus on tab switch. Severity: 4/10

Existing Risk: 4/10 - A later change that follows the documented rule restores Cancel focus for `choose` questions, reintroducing the focus fight this commit removes and landing keyboard users on a button they did not target instead of the first radio or preselected Submit.

Proposal Risk: 1/10 - The three descriptions then agree with the hook and no focus behavior changes, leaving only the risk that a future edit updates one description and misses the others.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2257 "document the choice form's tab-switch focus carve-out". In `web/src/useFocusOnTabSwitch.ts`, extend the comment above the hook to say that `ask` and `approve` questions send focus to Cancel while `choose` questions deliberately do nothing and let their form set focus. In `web/src/useTabHandles.ts`, qualify the comment so the question-panel handle is named as the Cancel target for `ask` and `approve` only. In `product/specs/agent-questions.md`'s Keyboard focus and navigation section, add a sentence saying that switching to a tab with a pending `choose` question leaves focus to the choice form, which focuses Submit when a default is preselected and the first listed radio otherwise, and keep the existing "regardless of whether the question is a free-text or approval question" claim scoped to those two kinds. Do not change runtime focus behavior: the tests in `web/src/useFocusOnTabSwitch.test.ts` and `web/src/shared/questions/QuestionPanel.test.tsx` pin both branches and must keep passing untouched.
