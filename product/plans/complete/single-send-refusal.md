# Report a failed send once

**Complexity: 1/10** — one callback argument and one return string in one function, plus one test case.

## Goal

`runSend` passed `appendTo(managers, label)` as `resolveTarget`'s report callback. `resolveTarget` appends `No tab named "<label>".` to the delegating tab before returning undefined, which `runSend` then followed with its own `Sent nothing to "<label>".` return value. One failed send therefore appeared twice: once in the transcript and once as the tool result the agent reads next.

## Approach

Keep `resolveTarget` — it resolves a display alias as well as a label, and its `undefined` return is what distinguishes "no such tab" from a delivery error. Give it a callback that discards its text, so the transcript stays the command bar's own record and the agent reads the refusal exactly once.

Return the same wording `resolveTarget` would have written, so the agent's next prompt is the sentence a person would have seen.

## Tests

One case in `src/acp/delegation.test.ts`: `send nosuchtab go` resolves to `No tab named "nosuchtab".`, `managers.tab.append` is never called, and `command.dispatchTo` is never called.

## Out of scope

- `deliverTo`'s own error return, which already comes back exactly once.
- What `send` reports for a person typing it in the command bar.