# Correct the MCP approval and remote verification actions

**Complexity: 1/10** — Five verification requirements and no production or test changes (p=2.84)

## Goal

Make the MCP pull request and its source plan describe verification steps a reviewer can perform, with the exact approval request and existing automated checks for the remote edge cases.

## Requirements

1. “Match the panel's `approve` branch” means the prompt names the approval kind, the target tab, and both options.
2. “Make the background badge observation before focusing the harness again” means check the badge and notification while the target tab remains out of view.
3. “Launch with `on <host>` from the local command bar” means run the remote harness command in the local Janissary instance.
4. “Route protocol rejection ... to the existing defensive assertions” means use the relay tests for malformed input and a subsequent valid request.
5. “Route ... controlled far-side collision checks to the existing defensive assertions” means use the current endpoint and remote-server tests for the bind failure, port release, and later launch refusal.

## Design decisions

- Keep the ordinary question and Attach flow as manual app verification. Give protocol and port-collision checks exact test commands that can reproduce those cases without a second host.
- Edit the specified Verification steps in the source plan and pull request body. Preserve the other descriptions and historical test results.

## Preserved behavior

1. A valid approval returns the selected option. It never returns a free-form response when the user chooses a listed option. The test “registers a valid approve on the resolved tab and returns the chosen option” pins the tool result.
2. A background question badges its tab and records a notification. The badge appears without selecting that tab. The test “marks a background tab unread when a question becomes pending and still notifies” pins the behavior.
3. A remote endpoint reports a bind failure once per refused harness before that harness exits. The failure never ends the remote session. The test “reports a failed shared MCP endpoint to a later harness before exiting it” checks both harnesses.

## Assumptions

1. `web/src/shared/questions/QuestionPanel.tsx:30` focuses Cancel when `question.kind === 'approve'`.
2. `help/harness.md:9` documents `on <address>` as part of the local `harness` command.

## Existing functionality

1. `src/remote/mcp-relay.test.ts:73` checks that a malformed call registers no question and that the same ID later works for a valid call.
2. `src/remote/serve-mcp.test.ts:194` checks a real port collision and release through the shared pool.
3. `src/remote/serve.test.ts:606` checks output and exit order for both attempts on the failed endpoint.

## Implementation steps

1. Correct the source plan's Verification section. Give the approval prompt literal inputs, check the background badge before focusing the harness, and use the local command bar for the remote launch. Use existing automated tests for malformed remote calls and the bind collision. Run `$janissary/scripts/run.mjs check-diff`.
2. After the plan and backlog change is pushed, correct the matching verification instructions in the PR description. Preserve all other sections and confirm GitHub shows the new body. Run `$janissary/scripts/run.mjs check-diff` before publishing the commit.

## UI design

1. The documentation directs the reviewer to the existing approval panel, tab strip, local command bar, and Sessions view.

## Tests

This repair changes verification instructions. It adds no application behavior or test cases. Run the existing approval, background-question, relay, and bind-collision tests named in this plan.

## Out of scope

Application changes, unrelated PR body sections, and updates to the remaining evidence anchors.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff`.
2. Read the PR's **How to verify** steps 2, 3, 5, 11 and 12 alongside the source plan's **Verification** section. Confirm that the prompt asks for `kind: "approve"`, the badge is checked before selecting the harness, the remote command is entered locally, and the malformed-input and port-collision commands name existing tests. Any instruction to send raw remote frames through the app or guess its next port indicates the old verification direction is still present.
