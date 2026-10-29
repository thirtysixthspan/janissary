# technical-debt

## ready

## development

* Reduce the cognitive complexity of `onEvent()` in `web/src/shared/ws/ws.ts` (line 83), reported at 16 against the allowed 15 in a 270-line file. The handler dispatches WebSocket server events through a switch whose cases update state, deliver PTY data, notify listeners, or answer collection requests. This is risk-sensitive because it handles network and PTY events. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `onEvent()` in `web/src/shared/ws/ws.ts`. Severity: **medium**. — deferred: `ai/tasks/hygiene/reduce-complexity.md` was blocked because the required baseline test suite failed (`ShellTab.test.tsx` expected `first`, received `second`).

## deferred

## declined
