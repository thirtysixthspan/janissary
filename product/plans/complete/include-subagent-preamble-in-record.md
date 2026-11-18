# Include the subagent preamble in its connection record

**Complexity: 2/10** — ~8 added lines in one production file, 4 behavioral requirements and 5 test scenarios (p=4.15)

## Goal

A subagent's durable record — the view rendered in its connection tab — currently stores only the task prompt (`subagentTaskPrompt`: the lead-in, task text, and context). The subagent also receives an automatic command primer at the provider boundary (the "preamble": available tools, the disabled harness tools such as `bash` and `shell`, the command-exchange protocol, and the Markdown instruction), but that primer is added inside the tool loop and never reaches the record, so the connection tab shows a first prompt the model was never actually given in isolation. Record the same preamble the subagent receives as part of the first prompt block, so the transcript reflects the complete provider input while the loop keeps prepending the primer exactly once.

## Design decisions

- The preamble is `corePrimer(snapshot, createAcpToolTable(snapshot.grants))`, computed from the same captured `attemptSnapshot` the loop receives. That is the exact string `driveToolLoop` prepends to the first raw provider prompt for a local run, and the far side of a remote run computes the same primer from the same snapshot, so one computation covers both paths without drift.
- The preamble is written into the record's first prompt block by prepending it to the text passed to `run.record?.prompt(...)`, separated by the same blank line the loop uses. The connection tab therefore shows `primer + '\n\n' + task prompt`, identical to the raw first prompt.
- The loop input is unchanged: `runToolLoop` still receives only the task prompt and still prepends the primer itself. Only the record display changes; no protocol, snapshot, or provider behavior is altered.
- Snapshot creation moves just above the record write so the same snapshot object feeds both, preserving the existing "captured once" contract.

## Implementation steps

1. In `src/subagent/attempt.ts`, extend the existing `../acp/drive-loop.js` import to include `corePrimer` and add an import of `createAcpToolTable` from `../acp/tool-table.js`. Run check-diff.
2. In `runSubagentEntry`, compute `snapshot = attemptSnapshot(settings, nativeSettings)` before the record write, then compute `const preamble = corePrimer(snapshot, createAcpToolTable(snapshot.grants))` and change the write to `run.record?.prompt(`${preamble}\n\n${prompt}`)`. Remove the now-duplicate snapshot declaration below. Run check-diff.

No production file approaches the 200-line limit after this edit (`attempt.ts` grows by an import and a few statements).

## Tests

- `src/subagent/attempt.test.ts`: update the first test so `record.prompt` is called once with the full preamble plus task prompt (`${primer}\n\n${subagentTaskPrompt(TASK, CONTEXT)}`); assert the recorded text equals the raw first provider prompt, that the primer appears exactly once in each, and that the task prompt follows it intact. Add a case for the no-context form.
- `src/subagent/integration.test.ts`: assert the durable record's first block `prompt` contains the core primer (including `DISABLED_HARNESS_TOOLS_LINE`) followed by the task text, confirming the connection tab view.
- All existing `src/subagent/` suites stay green apart from the intentionally updated exact-string expectation.

## Out of scope

- Changing the raw provider prompt, the tool loop, `corePrimer` contents, the snapshot, or any wire/protocol version.
- Changing how the record renders blocks, the connections list, or any other tab's records.
- Adding the primer to non-subagent ACP records; the `ask`/`tell` record feed is untouched.

## Spec and docs

- `product/specs/subagent.md`: the attempt paragraph currently states the recorded input contains no automatic primer; change it to state that the first recorded prompt includes the same command primer the subagent receives at the provider boundary, prepended to the lead-in, task text and optional context, while the loop still prepends the primer only once on the raw prompt.
- `help/subagent.md` and the user-documentation tree do not describe the contents of the record's transcript; no change expected.
