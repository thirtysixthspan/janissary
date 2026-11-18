# Report unavailable system-initiated commands as an explicit refusal

**Complexity: 2/10** — ~5 added lines in 1 production file, 3 behavioral requirements and 3 test scenarios, no new units (p=3.75); a single-branch append-and-return change with no architecture.

## Goal

A system-initiated command issued directly through the command manager — the concrete case is the client's `resetAcp` message, which runs `ask-reset` — resolves outside the ordinary dispatcher. When that command's availability predicate is false for the target tab (ACP unavailable), the executor re-dispatches the input through `resolveInTab`, which filters on the same predicate, so the second pass cannot resolve it and the user sees an unknown-command line instead of a reason. The executor should instead append a clear refusal naming the command and saying it is unavailable in this tab, and return that refusal to the direct caller. No flag, key binding, notification, or message wording for other paths changes.

## Approach

`CommandManager.executeCommandWithContext` already has a refusal branch for disabled commands immediately above the unavailable branch: it appends through `managers.tab.appendForInvocation` and returns the refusal string. Replace the unavailable branch's `this.run(command, label, index)` re-dispatch with the same append-and-return pattern, using a new refusal line `Command is unavailable in this tab: <name>.` where `<name>` is the command's canonical name. The ordinary dispatch paths (`run` and `dispatchLine`) reach this method only after `resolveInTab` has already filtered on availability, so only direct `executeCommand` callers can hit the new branch; returning the refusal string matches the disabled branch and cannot change those paths.

## Implementation steps

1. In `src/command/manager.ts`, in `executeCommandWithContext`, replace the body of the `if (cmd.available?.(label, this.managers) === false)` branch (currently `this.run(command, label, index); return;`) with: build `const output = \`Command is unavailable in this tab: ${name}.\``, append `{ input: command, output }` for `invocation.invocationId` via `this.managers.tab.appendForInvocation`, and return `output`. Run `$janissary/scripts/run.mjs check-diff`.
2. Confirm `src/command/manager.ts` stays under the 200-line limit and relative `src/` imports keep their `.js` suffix. Run `$janissary/scripts/run.mjs check-diff` once more with the change in place.

## Tests

- `src/command/manager.test.ts` — in the disabled-command-policy describe block (or a new small block), add a case that calls `executeCommand('ask-reset', 'ask reset', 'janus', 0)` against a plain root tab where `acpAvailable` is false, asserting the call resolves to `Command is unavailable in this tab: ask-reset.`, that the tab log ends with that exact refusal row, and that no `Unknown command` line is emitted. Keep every existing disabled-command refusal case passing.

## Spec

- `product/specs/application-commands.md` — add a short subsection under command dispatch recording that a command issued directly to the command manager whose availability predicate is false for the target tab reports `Command is unavailable in this tab: <command>.` and is not re-dispatched as an unknown command.

## Out of scope

- Changing availability predicates (`acpAvailable`), the `ask-reset` command, or the client `resetAcp` caller.
- Changing disabled-command policy, the `command-disabled` notification, or the unknown-command reply for ordinary typed input.
- Any new command, flag, key binding, notification type, or help page.
