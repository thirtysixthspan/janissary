# Allow auto-approve (`-y`) without a workspace, with a security warning

**Complexity: 4/10** — removes a validation guard duplicated across three call sites (CLI command
parsing, profile-entry launching, the launch dialog) and adds one new pure warning function plus
its call site. No new architecture, no protocol changes, no new state.

## Goal

Today, launching a harness with auto-approve (`-y`/`--yes`) requires `-w`/`--workspace` — enforced
as a hard error in `harness <name> -y` command parsing, in profile-entry launching, and by graying
out the dialog's Auto-approve checkbox. Per the backlog item, allow auto-approve **without** a
workspace, but print a security warning in the launched harness's terminal, since without a
disposable workspace clone (and, on macOS, its sandbox) an auto-approved prompt now acts on the
user's real working directory unattended. `-y` stays claude-only in all cases — only the
workspace requirement is dropped.

## Approach

`-y`'s claude-only / requires-workspace validation is duplicated at three sites, all explicitly
commented as mirroring each other:

- `src/harness/command-parse.ts:45-46` (`parseHarnessFlags`) — the in-app `harness …` command grammar.
- `src/profile/entry-openers.ts:32-33` (`openHarnessEntry`) — profile-file / scheduled launches.
- `web/src/HarnessLaunchDialog.tsx:31,37` — the New harness dialog's checkbox gating.

Drop only the `!workspace` half of each guard, keeping the claude-only check. Then add a security
warning shown in the new harness tab's own terminal (not a startup-wide banner) when it launches
auto-approving without a workspace — mirroring the existing precedent at
`src/harness/manager.ts:202-203`, where `finishSpawn` appends `sandboxNotice()` to the tab's
transcript when a workspaced tab isn't actually sandboxed. A new pure function,
`autoApproveWithoutWorkspaceWarning(autoApprove)` in `src/harness/auto-approve.ts` (alongside the
rest of the auto-approve logic), returns the warning text or `undefined`; `finishSpawn` calls it
in the `!workspaceDir` branch of the existing notice ternary, so the two notices remain mutually
exclusive (a tab is either workspaced-with-a-sandbox-caveat, or not-workspaced-with-an-auto-approve-caveat,
never both) and both funnel through the same `managers.tab.append(label, { input: '', output: notice })`
call.

## Implementation steps

1. **`src/harness/command-parse.ts`**: delete line 46 (`if (autoApprove && !workspace) return { error: ... }`).
   Update the JSDoc above `parseHarnessCommand` (lines 63-64) to drop the "and requires
   `-w`/`--workspace`" clause — `-y` is claude-only but no longer needs a workspace.
2. **`src/profile/entry-openers.ts`**: delete line 33 (`if (entry.autoApprove && !entry.workspace) return ...`)
   and update the comment above (lines 30-31) to drop the "and requires a workspace" clause.
3. **`src/types.ts`**: update the two comments on `autoApprove?: boolean` fields (`ProfileHarnessEntry`
   around line 268-270, `TabState` around line 211-212) to drop the workspace-requirement language.
4. **`src/harness/auto-approve.ts`**: add
   ```ts
   export function autoApproveWithoutWorkspaceWarning(autoApprove: boolean): string | undefined {
     return autoApprove
       ? 'auto-approve is on without a workspace: prompts are approved unattended against your real files, with no sandbox confining the harness'
       : undefined;
   }
   ```
   with a short comment explaining when it fires (mirrors `sandboxNotice`'s doc style).
5. **`src/harness/manager.ts`**: import `autoApproveWithoutWorkspaceWarning` from `./auto-approve.js`.
   In `finishSpawn` (around line 202), change
   `const notice = workspaceDir ? sandboxNotice() : undefined;`
   to
   `const notice = workspaceDir ? sandboxNotice() : autoApproveWithoutWorkspaceWarning(autoApprove);`
6. **`web/src/HarnessLaunchDialog.tsx`**:
   - Line 31: `const autoApproveEnabled = fields.name === 'claude' && fields.workspace;` → `const autoApproveEnabled = fields.name === 'claude';`
   - Line 37: `if (!(next.name === 'claude' && next.workspace)) next.autoApprove = false;` → `if (next.name !== 'claude') next.autoApprove = false;`
   - Line 75: update the label text from `Auto-approve (-y) — claude + workspace only` to
     `Auto-approve (-y) — claude only`.

## Tests

- `src/harness/index.test.ts`:
  - Replace `'errors when -y is given without -w'` (lines 124-128) with a test asserting `-y` alone
    now succeeds: `parseHarnessCommand('harness claude -y')` sets `autoApprove: true` and
    `workspace: false`.
  - Simplify `'reports the claude-only error before the -w error for a non-claude harness'`
    (lines 136-139) to drop its now-inaccurate name/framing — rename to something like
    `'errors when -y is given for a non-claude harness with no other flags'` and keep the same
    assertion (claude-only error).
- `src/harness/auto-approve.test.ts`: add a `describe('autoApproveWithoutWorkspaceWarning', ...)`
  block with two cases — returns the warning string when `autoApprove` is `true`, returns
  `undefined` when `false`.
- `web/src/HarnessLaunchDialog.test.tsx`: replace `'disables Auto-approve unless the harness is
  claude AND workspace is on'` (lines 33-39) with a test that Auto-approve is enabled for claude
  regardless of the Workspace toggle (assert `disabled === false` with Workspace off). Keep
  `'keeps Auto-approve disabled for a non-claude harness even with workspace on'` (lines 41-46)
  unchanged — that constraint is unaffected.
- `web/src/harness-launch-command.test.ts`: update the stale comment on the test at lines 48-52
  (`'never emits -y without -w ...'`) — the "invalid pairing is prevented upstream" claim is no
  longer true. Rename the test to describe what it actually checks (flag ordering) and drop the
  outdated comment, or fold it into the existing `'assembles every flag in a fixed order'` test
  since it now asserts the same thing.

Run `./scripts/run.mjs check-diff` after each step.

## Spec updates

- `product/specs/harness.md`:
  - Lines 108-111 ("Auto-approve permissions" section): replace "The flag is **claude-only** and
    **requires** `-w`/`--workspace`" and the two bullets with: the flag is **claude-only**;
    `harness claude -y` (no `-w`) now launches successfully, and a security warning line appears
    in the new tab's terminal warning that prompts are approved unattended with no workspace
    sandbox; `harness opencode -y` (any non-claude harness) still errors.
  - Lines 32-33 (dialog description): update "**Auto-approve** is disabled unless the selected
    harness is claude *and* Workspace is on" to "disabled unless the selected harness is claude".

## Docs

- `help.md:27`: update the `harness` row's parenthetical from "`-y` / `--yes` to auto-approve
  claude's permission prompts — claude only, requires `-w`" to "claude only" (drop "requires
  `-w`").
- `documentation/user-documentation/advanced-agents/harness.md`:
  - Line 44: update "**Auto-approve** stays disabled unless you've picked claude and turned on
    **Workspace**" to "stays disabled unless you've picked claude".
  - Lines 73-76: update "It's claude-only and requires `-w`:" and the `harness claude -y` error
    bullet — replace with a note that `-y` alone now works and prints a security warning in the
    harness's terminal, since there's no workspace sandbox confining it.

## Out of scope

- opencode/codex auto-approve support — still claude-only, unchanged.
- The sandbox/workspace mechanics themselves (`src/sandbox/*`, `src/workspace*`) — unaffected.
- Any change to how the auto-approve keystroke detection/injection itself works
  (`HarnessAutoApprover`, `detectPermissionGate`) — only the launch-time gating and warning change.
