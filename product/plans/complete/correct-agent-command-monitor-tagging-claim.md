# Correct the agent-command monitor tagging claim

**Complexity: 1/10** — a two-sentence documentation correction: 0 production lines, 0 production files, 2 stated requirements (p=2.35).

## Goal

The agent-command spec and its user page both say a remote run's far-side workspace step appears, tagged `[<host>] `, on the run monitor's activity lines. The implementation never puts a tool-loop step there: the step reaches only the connection record.

`startCommand` and `ranCommand` in `src/agent/execute.ts` call `run.record?.activity(...)` directly. `AgentRun.reportActivity` in `src/agent/run.ts` is the only path that pushes to `run.activity`, the array `web/src/plugins/agent-monitor/view.tsx` renders, and those handlers never call it. The far-side `acp-tool-step` path in `src/remote/acp-session-run.ts` reaches the same handlers with `workspace: true`, so a remote run's tagged command and result lines are written to the connection record and nowhere else.

Correct the two documents to describe the connection record that actually carries the two tagged tool lines, and state plainly that the monitor does not show them.

## Approach

1. **Spec.** In `product/specs/agent-command.md`'s `### Remote task execution`, replace the "both monitor and record activity lines" sentence with a statement that the tag appears on both `tool` activity lines in the connection record — the command line and the result line — while the monitor does not receive the step, and a caller-side step and a gate refusal are untagged. This matches the existing `### Durable run records` sentence that granted host command/result steps are separate tool entries and do not add synthetic monitor activity, and mirrors `product/specs/acp.md`, which already describes the record lines for the core tab.

2. **Page.** In `documentation/user-documentation/advanced-agents/agent-command.md`, drop the monitor claim from the activity paragraph and keep the record wording: a remote run's workspace step is shown with `[<host>] ` at the start of both tool activity lines in its connection record, and a caller-side step is not tagged. Mirror the phrasing already used for the core tab in `documentation/user-documentation/advanced-agents/acp-agent.md`.

## Implementation steps

1. Edit the final sentence of the `### Remote task execution` paragraph in `product/specs/agent-command.md`.
2. Edit `documentation/user-documentation/advanced-agents/agent-command.md`: remove the monitor-activity claim from the activity paragraph and state the record wording in the retained-record paragraph, where the connection record is introduced. Mirror the phrasing already used for the core tab in `documentation/user-documentation/advanced-agents/acp-agent.md`.

## Tests

No production behavior changes, so no new tests are warranted. Existing coverage already pins the behavior the corrected text describes:

- `src/agent/execute.test.ts` asserts the remote far-side workspace step reaches `run.record.activity` as both tagged tool lines and never asserts monitor activity.
- `src/acp/run-prompt.test.ts` pins the core tab's tagging that this correction leaves alone.

Verify with `$janissary/scripts/run.mjs check-diff` and the docs build (`npm run docs:build`), because the edited page is part of the VitePress site.

## Out of scope

- Routing loop steps through `run.reportActivity('tool', ...)` so the monitor shows them. That is a separate behavior change, named as such in the entry, and it would need new remote-run coverage on `run.view().activity`.
- The core-tab tagging in `src/acp/run-prompt.ts` and its tests, which is correct as written.
- Any other sentence in the spec or page.
