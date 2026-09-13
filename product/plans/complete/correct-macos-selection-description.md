# Correct macOS selection description

## Complexity

2/10.

## Goal

Correct the pull request description's macOS terminal-selection gesture.

## Approach

The existing terminal option and harness spec agree: Option-drag forces selection on macOS while Shift-drag does so elsewhere. Correct only the two gesture parentheticals in PR #1110's behavior example and verification instructions. Preserve every other byte of the PR body and leave its title unchanged. Apply the description edit after pushing the file changes.

## Implementation steps

1. Extend `web/src/harness/HarnessTab.test.tsx` with the real shared terminal hook and default menu, using its existing mocked xterm. Verify macOS forcing is configured and the terminal selection reaches Chat about this above Paste, without Copy or sending input to the harness. Run `./scripts/run.mjs check-diff` and the existing terminal-key tests.
2. Add the platform-specific gesture to `product/specs/context-menu.md`. Help needs no correction; public harness documentation already says Option-drag on macOS and Shift-drag elsewhere.
3. Promote the plan, remove the final backlog entry and drained file, run final diff checks, and push to the existing open PR.
4. Read the current PR body, replace `(Shift-click on macOS)` and `(with the macOS Option-click gesture)` with `(Option-drag on macOS; Shift-drag elsewhere)`, write the complete body under `temp/`, and apply it through `gh pr edit --body-file`. Verify that the rest is unchanged and the PR remains open at the pushed commit.

## Tests

The harness integration case checks the terminal option, selection bridge, menu ordering, and exact action payload. Existing terminal-key and harness tests cover copying and input routing. Compare the applied PR body with the exact two-substitution result.

## Verification limitation

No contained browser is attached: JANISSARY_BROWSER_WS_ENDPOINT and JANISSARY_PLAYWRIGHT are absent. A manual Option-drag check cannot be performed in this workspace. Automated configuration and selection-routing tests cover the supporting behavior; they do not simulate a physical drag in a real terminal.

## Out of scope

Terminal implementation changes, other PR body corrections, title changes, public documentation additions, and merging. No new comments.
