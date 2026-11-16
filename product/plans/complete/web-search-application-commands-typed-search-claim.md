# Correct the application-commands spec's claim that disabling the native web search row leaves typed web search running

**Complexity: 1/10** — a spec paragraph rewrite plus two policy regression cases, with no production files or lines (p=2.76).

## Goal

`product/specs/application-commands.md` must describe the rule the dispatcher actually applies: a typed `web search` line resolves to the native `web search` row, so disabling that row refuses the typed line as well as the agent tool. Disabling the parent `web` row disables both rows.

## Issue

Recorded on PR #2010's branch backlog, severity 4/10:

> Correct the application-commands spec's claim, added by this subplan, that disabling the native web search row leaves typed web search lines running.

The paragraph the `web search` ACP-tool slice added says:

> Typed `web search` lines are claimed by the `web` builtin, so disabling only the native `web search` row does not refuse a typed search.

The second clause is false. `resolveApplicationCommand` ranks matching rows by their longest matching form, so `web search x` matches the builtin `web` row (form `web`, three characters) and the native `web search` row (form `web search`, ten characters); the native row wins. `disabledApplicationCommand` then reads that row's effective settings and refuses the line whenever the row is effectively off. The same resolution is what makes a typed `file write` line follow its native row.

Verified against the code:

- `src/application-commands.ts` declares the parentless `web` builtin with form `web` and adds the native `web search` row with parent `web` through `NATIVE_ACP_COMMANDS`.
- `src/shared/command-matching.ts`'s `rankCommandRows` sorts by `longestForm` descending, so the native row outranks the bare builtin for any `web search …` line.
- `src/native-commands/policy.ts`'s `disabledApplicationCommand` resolves the input to that native row and returns it when `effectiveEnabled` is false.
- `src/native-commands/manager.ts` computes a child row's `effectiveEnabled` from its own setting and its parent's, so disabling `web` makes both rows effectively disabled while disabling `web search` leaves bare `web` enabled.
- `src/native-commands/policy.test.ts` already pins the matching `file read`, `file glob`, and `file write` behavior through its `current()` settings helper.

## Approach

1. Rewrite only the two sentences about typed lines in the `web search` paragraph of `product/specs/application-commands.md`, leaving the paragraph's opening sentence about the row's parent and settings unchanged.
2. Make the new sentences match the native `file` paragraph: disabling `web search` disables only that row and refuses the typed `web search` command as well as the agent tool; disabling `web` disables both; a typed `web search` line resolves to the native row exactly as a typed `file write` line does.
3. Add a `web search rows` regression block to `src/native-commands/policy.test.ts` beside the file mutation block. Hoist the existing `current()` helper and its temp-directory cleanup from the file mutation block to file scope so both blocks use the same helper.
4. Pin the two settings cases the entry names: `{ "web search": { "enabled": false } }` refuses `web search x` as `web search` while bare `web` stays allowed; `{ "web": { "enabled": false } }` makes `web search` effectively disabled, refuses the typed `web search x` line as the native row, and refuses bare `web` as the builtin row.
5. Run `$janissary/scripts/run.mjs check-diff`.

## Design decisions

- **State the resolver's actual rule, not a workaround.** The old paragraph told a reader that the native row does not govern typed lines. The correction says it does, and names the `file write` sibling so the two native-child rows read alike.
- **Keep the behavior unchanged.** Only the spec and a regression test change. `resolveApplicationCommand` already ranks the native row first and `disabledApplicationCommand` already refuses it.
- **Exercise the real settings manager.** The `current()` helper builds a project/home pair and reads a snapshot through `NativeCommandSettingsManager`, so the cases cover parent propagation rather than a hand-built snapshot that could drift from the manager's rule.
- **Hoist the helper instead of copying it.** Duplicating the temp-directory setup and cleanup would let the two copies drift; a file-scope helper keeps one definition and keeps the existing file mutation cases byte-for-byte in their assertions.
- **Leave the completed subplan's parenthetical alone.** `product/plans/complete/web-search-12-acp-tool.md` carries the same mistaken claim, but the recorded work item names the spec paragraph and the regression case. Plans record what was planned at the time; this fix records the correction.

## Proposed changes

`product/specs/application-commands.md`, the `web search` paragraph:

```markdown
The native `web search` row has the parent `web` and its own Enabled and Agent access settings. Disabling `web search` refuses the agent tool, and disabling `web` disables both. Typed `web search` lines are claimed by the `web` builtin, so disabling only the native `web search` row does not refuse a typed search.
```

becomes:

```markdown
The native `web search` row has the parent `web` and its own Enabled and Agent access settings. Disabling `web search` disables only that row, and refuses the typed `web search` command as well as the agent tool; disabling `web` disables both. A typed `web search` line resolves to the native row exactly as a typed `file write` line does.
```

`src/native-commands/policy.test.ts` moves the `roots` array, its `afterEach` cleanup, and `current()` out of `describe('file mutation rows')` to file scope, then adds:

```ts
describe('web search rows', () => {
  it('refuses a typed web search through its disabled native row', () => {
    const settings = current({ 'web search': { enabled: false } });
    expect(disabledApplicationCommand('web search x', settings)?.name).toBe('web search');
    expect(disabledApplicationCommand('web', settings)).toBeUndefined();
  });

  it('refuses a typed web search when its web parent is disabled', () => {
    const settings = current({ web: { enabled: false } });
    expect(effectiveCommandSetting(settings, 'web search').effectiveEnabled).toBe(false);
    expect(disabledApplicationCommand('web search x', settings)?.name).toBe('web search');
    expect(disabledApplicationCommand('web', settings)?.name).toBe('web');
  });
});
```

No production source change, and no help or user-documentation change; `help/web.md` and `documentation/user-documentation/` do not describe the settings rows.

## Tests

New cases in `src/native-commands/policy.test.ts`:

- A disabled `web search` row refuses `web search x` as `web search`, while bare `web` is not refused.
- A disabled `web` parent makes the `web search` row effectively disabled, refuses `web search x` as the native row, and refuses bare `web` as the builtin row.

Existing cases that must keep passing unchanged:

- The `file read`, `file glob`, and `file write` cases in `describe('disabledApplicationCommand')`.
- The three `file mutation rows` cases, whose only change is that `current()` and its cleanup now live at file scope.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Read `src/application-commands.ts`, `src/shared/command-matching.ts`, `src/native-commands/policy.ts`, and `src/native-commands/manager.ts` beside the corrected paragraph.
- Confirm the paragraph now says the native row refuses the typed line, the same way the native `file write` paragraph does.

## Spec

Update `product/specs/application-commands.md`'s `web search` paragraph as shown under Proposed changes. No other spec file names this typed-line rule.

## Out of scope

- Changing any production source file, including `src/application-commands.ts`, `src/shared/command-matching.ts`, and `src/native-commands/policy.ts`.
- Rewriting `product/plans/complete/web-search-12-acp-tool.md` or any other completed plan.
- `product/specs/web-search.md`'s typed-command claims beyond the settings row.
- `help/` and `documentation/user-documentation/` pages.
- Other backlog entries on the branch.
- Rebasing, merging, or resolving the branch's conflict with `master`.

## Rating basis

lines_added=0, files_edited=0, requirements=2, scenarios=2, new_units=0. Production counts are zero because the only behavior that changes is documented, not implemented; the two requirements are the corrected spec statement and the regression case, and the two scenarios are the two settings cases. p = 1.578 + 0.705·ln(3) + 0.369·ln(3) = 2.76, under the 3.461 threshold for 1.
