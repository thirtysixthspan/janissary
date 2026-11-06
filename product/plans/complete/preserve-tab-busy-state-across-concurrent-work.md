# Fix: preserve tab busy state across concurrent ACP and shell work

**Complexity: 4/10** — add transient owner tracking to the existing tab runtime busy projection, then connect the shell and ACP lifecycles to their own tokens. The existing boolean view contract stays unchanged.

## Goal

A tab stays busy while any of its active operations remain in flight. Completing a shell command must not clear an ACP prompt's activity, and settling one ask or tell prompt must not clear another prompt or shell command.

## Approach

Keep `TabRuntime.busy` as the boolean consumed by tab views. Track unowned legacy activity separately from a set of identity-based busy owners, and recompute the boolean as their union. Existing callers without an owner keep their current set/clear behavior. Shell commands receive one unique owner per `run`; ACP uses each `AcpPendingPrompt` object as its owner. Each completion releases only its token.

Remote session termination is an explicit terminal boundary for every operation on that remote tab. Replace its direct `runtime.busy = false` write with a `clearBusy` operation that clears both unowned activity and owner tokens, so later async releases are harmless.

## Implementation steps

1. Add busy-owner state to `TabRuntime` and owner-aware acquire, release, and clear operations in the tab runtime layer. Keep the existing boolean projection current. Cover multiple owners, legacy activity, unknown-token release, and terminal clearing in runtime-operation tests.
2. Route transcript running-entry acquisition through the shared busy operation and allow a running entry to carry an owner. Add optional owner parameters to the `TabManager` busy methods. Update remote session termination to clear all busy activity through the manager API.
3. Give each `ShellManager.run` call a unique owner and release it from that command's running-entry finalizer. Keep shell commands individually owned even when their execution is serialized.
4. Acquire a busy owner when `AcpManager` installs a pending prompt, using that prompt object as identity. Release it in `settleAcpPrompt`, remove the turn-level unowned busy latch from `runCorePrompt`, and remove the now-unused role-wide `hasAcpPrompt` helper.
5. Extend `src/acp/record-feed.test.ts` with the real ACP and shell managers plus a controlled shell fixture. Cover ask and tell with shell completion first, then ask and tell settling in sequence; cover the reverse order and confirm busy clears only when the shell completes. Update any supporting runtime or remote tests if the APIs require them.
6. Update the busy-indicator behavior in `product/specs/tabs.md` and ACP busy behavior in `product/specs/acp.md`. Update the existing user-facing tabs documentation if its description needs to state that overlapping work keeps the dot blinking. Check help pages and other user documentation for descriptions that conflict.

Run `$janissary/scripts/run.mjs check-diff` after each implementation step and after tests and documentation changes.

## Tests

- `src/tab/runtime-operations.test.ts` verifies two owners retain busy state until both release, legacy activity composes with owners, and a clear resets all activity.
- `src/acp/record-feed.test.ts` verifies both shell-first and prompt-first completion orders for simultaneous ask, tell, and shell work.
- Any test fixture affected by the new terminal clear API is updated and asserts its behavior where useful.

## Verification

`./scripts/run.mjs check-diff` passes lint, incremental typecheck, and diff-scoped server tests. The existing help pages do not describe the changed busy behavior. The user-facing tab-strip description was updated alongside the specs.

## Specs and documentation

- `product/specs/tabs.md` describes that the busy dot remains active until all overlapping work finishes.
- `product/specs/acp.md` states that ACP activity coexists with shell activity and that the tab stays busy until all active prompts and shell work settle.
- Check `help/commands.md`, relevant `help/` pages, and `documentation/user-documentation/`. Update only existing descriptions of this behavior.

## Out of scope

- Changing the public tab-view `busy` boolean or its wire representation.
- Replacing the existing unowned busy latch for unrelated operations.
- Changing shell command serialization, ACP prompt ordering, transcript output, or unread behavior.
- Changing plugin-owned busy state, which is tracked separately from `TabRuntime.busy`.
