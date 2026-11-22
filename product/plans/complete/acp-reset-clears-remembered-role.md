# Reset the remembered ACP role on resetAcp

**Complexity: 2/10** — ~4 added lines in 1 existing production file, 3 behavioral requirements and 2 test scenarios (p=3.61)

## Goal

A plugin capability started under a custom role (`startAcp({ role })`) remembers that role for its later `promptAcpResult` calls. When the capability's tab is reset with `resetAcp`, that remembered role must be cleared back to the documented `ask` default, so a following `startAcp` with no request — and the `promptAcpResult` that follows it — use `ask` rather than silently reusing the stale role. The launcher always passes an explicit role, so this change must leave its behavior untouched.

## Approach

In `acpCapabilities` (`src/plugins/acp-capabilities.ts`), the closure variable `role` is initialized to `DEFAULT_ACP_ROLE` and is overwritten whenever `startAcp` is given a request with a `role`. Today `resetAcp` only closes the tab and leaves the closure holding the last explicit role. Change `resetAcp` from its concise arrow into a block that closes the tab first, then assigns `DEFAULT_ACP_ROLE` to `role`, then returns the close result — preserving the boolean contract and the "after closing" ordering. No other capability changes: `startAcp` keeps applying an explicit request role when present, and `promptAcpResult` keeps prompting under whatever `role` currently holds.

Rejected alternative: clearing the role inside `startAcp` when the request omits one. That would tie the reset to a later start rather than to the reset itself, and would not cover a caller that inspects behavior immediately after `resetAcp`.

## Implementation steps

1. In `src/plugins/acp-capabilities.ts`, rewrite `resetAcp` to close the owning tab, reset `role` to `DEFAULT_ACP_ROLE`, and return the close result.

## Tests

- `src/acp/plugin-session.test.ts`: add a case that starts a capability under a custom role, spies on `managers.acp.start` and `managers.acp.promptResult`, calls `resetAcp`, starts again with no request, and asserts both the `start` call and the `promptResult` call receive `ask`; settle the prompt and close sessions as the neighboring role-backed test does. Keep the launcher's explicit-role tests unchanged and passing.

## Spec and docs

- No spec change: `product/specs/acp.md` already states that a caller naming no role keeps the `ask` default and that the request is forgotten when the tab closes, which `resetAcp` does.
- No help or user-documentation change: neither documents the capability's remembered-role lifecycle.

## Out of scope

- The additive optional `role` field on `startAcp` in `src/plugins/api.ts`.
- The documented default in `product/specs/acp.md`.
- Runtime semantics of `AcpManager` reset/close, and the launcher's explicit-role behavior.
