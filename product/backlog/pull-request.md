<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the question text reachable when fixed controls fill the fitted panel height

Existing Issue: When the title plus fixed controls are taller than the fitted panel height, the flex body collapses to zero height and the question text is clipped by the panel's hidden overflow with no way to scroll to it. Severity: 5/10

Existing Risk: 5/10 - A question with many approval options, or any question in a short docked sidebar, hides the question text behind the controls, so the human can answer or cancel without ever reading what was asked.

Proposal Risk: 2/10 - Reserving a minimum body height and falling back to whole-panel scrolling keeps the text readable, and the change stays inside the fit hook and its CSS with the existing structure test as a guard.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2257 "keep the question text reachable when fixed controls fill the fitted panel height". In web/src/shared/questions/useQuestionPanelFit.ts, derive the overflow decision from the measured content height at the final width rather than the once-measured fixedHeight, and when the title plus footer leave no room for the body, size the panel to the full layer height and let the panel scroll instead of shrinking the body to zero. In web/src/theme.css, stop .question-panel-body from collapsing to zero under a tall footer by giving it a minimum height or letting .question-panel-content keep its natural height when the panel overflows, so the question text is never clipped by a zero-height flex child. Add a test with a short layer and a tall footer that asserts the question text remains visible and scrollable alongside the controls. The cases in web/src/shared/questions/panel-fit.test.ts and the existing QuestionPanel structure and focus tests must keep passing.
