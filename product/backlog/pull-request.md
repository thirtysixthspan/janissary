# pull-request

* Correct the pull request description's macOS terminal-selection gesture.

Existing Issue: The terminal behavior example says Shift-click selects harness output on macOS, contradicting both the description's later Option-click instruction and the configured xterm selection gesture. Severity: 2/10

Existing Risk: 3/10 - A macOS user following the behavior example while a harness has mouse reporting enabled cannot form the promised selection and concludes that Chat about this is unavailable.

Proposal Risk: 1/10 - Platform-specific documentation could drift again if terminal options change, so the existing terminal-key tests and the documented macOS manual check remain the reference.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1110: correct the macOS terminal selection gesture in the PR description". Correct the terminal behavior example in PR 1110's description to use Option-drag or Option-click as appropriate for the selection being demonstrated, matching the macOptionClickForcesSelection option and the platform explanation in web/src/shared/terminal/useXterm.ts; reserve Shift selection for non-macOS platforms. Make the behavior example and How to verify instructions agree, without changing terminal behavior. Cross-check product/plans/complete/harness-terminal-copy-selection.md and the existing terminal-key coverage under web/src/shared/terminal, and manually verify selecting harness output with Option on macOS followed by the Chat about this action when implementing this entry.
