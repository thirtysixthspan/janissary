# Replace the shared transcript transport prop with callbacks

**Complexity: 7/10** — a behavior-preserving dependency-boundary refactor across shared transcript and terminal components, five caller components, their existing interaction tests, and focused tests for the currently untested xterm hook.

## Goal

`web/src/shared/transcript/Transcript.tsx`, `web/src/shared/transcript/TerminalCard.tsx`, and `web/src/shared/terminal/useXterm.ts` no longer import or receive `JanusClient`. They receive only transcript intents and PTY callbacks, while app-facing callers adapt the existing client to those contracts. Rendering, scrolling, keyboard filtering, PTY lifecycle, and protocol messages stay unchanged.

## Approach

Keep transcript intent mapping as a pure adapter that accepts a `send` callback instead of a `JanusClient`. Add a pure PTY action adapter in the shared terminal feature that accepts only `send` and `attachPty`, then exposes attach, input, resize, terminal-color, and kill callbacks. Components and hooks consume those named callbacks, so the shared UI cannot reach unrelated client capabilities. Callers memoize the adapted actions by client identity so a render does not detach and recreate a live terminal.

## Implementation steps

1. Change `web/src/shared/transcript/transcript-intents.ts` to define the intent type and build it from a send callback, with no `web/src/ws.ts` import; pass the resulting `intents` prop into `Transcript` from `AgentTabBody`, `InactiveAgentTabBody`, and `NotificationsTab`.
2. Add `web/src/shared/terminal/pty-actions.ts` with the narrow PTY action type and adapter. Update `web/src/shared/terminal/useXterm.ts` to consume the actions instead of `JanusClient`, and update `TerminalCard.tsx` and `Transcript.tsx` to pass the actions and invoke the kill callback.
3. Adapt the terminal actions in `AgentTabBody.tsx`, `InactiveAgentTabBody.tsx`, `NotificationsTab.tsx`, `ShellTab.tsx`, and `HarnessTab.tsx` with `useMemo` keyed by the client. Keep `ShellTab` and `HarnessTab` key filters, focus behavior, active state, and handles unchanged.
4. Update the existing Transcript, TerminalCard, ShellTab, HarnessTab, AgentTabBody, InactiveAgentTabBody, and NotificationsTab tests to supply or assert the new callback contracts. Add adapter tests for every PTY action and a hook test that covers PTY attach, input, initial and observed resize, terminal color reporting, and teardown.

## Tests

Preserve the existing checks in `web/src/shared/transcript/Transcript.test.tsx`, `web/src/shared/transcript/Transcript.pin.test.tsx`, `web/src/shared/transcript/transcript-intents.test.ts`, `web/src/shared/transcript/TerminalCard.test.tsx`, `web/src/ShellTab.test.tsx`, `web/src/harness/HarnessTab.test.tsx`, and `web/src/NotificationsTab.test.tsx`. Add `web/src/shared/terminal/pty-actions.test.ts` for action-to-RPC mapping and attach delegation, and `web/src/shared/terminal/useXterm.test.tsx` for hook wiring and resource cleanup. Run `./scripts/run.mjs check-diff` after each implementation step and after the tests.

## Spec and documentation

This changes no user-visible behavior, command, setting, or documented behavior. No functional spec, help row, or public documentation change is needed.

## Out of scope

- Changing `JanusClient` or the WebSocket protocol.
- Changing transcript command routing, PTY messages, terminal key handling, scrolling, or focus behavior.
- Refactoring other shared components that accept `JanusClient`.
