# Move the xterm terminal modules into the shared layer

## Complexity

4/10 — a mechanical directory move of five files plus import-specifier rewrites in three source and five test files; no behavior change, but every mock path must be retargeted by hand.

## Goal

`web/src/shared/transcript/TerminalCard.tsx` imports `useXterm` from `../../useXterm`, an app-root module — the shared layer reaching upward into the app shell, against the one-way dependency flow (shared → feature → app). `useXterm.ts` pulls in `terminal-keys.ts` and `terminal-osc52.ts`, which live at the root as well. Move the three modules (and their two colocated tests) into `web/src/shared/terminal/` so the shared layer stops importing upward.

## Approach

Create `web/src/shared/terminal/` and move five files into it unchanged: `web/src/useXterm.ts`, `web/src/terminal-keys.ts`, `web/src/terminal-osc52.ts`, `web/src/terminal-keys.test.ts`, `web/src/terminal-osc52.test.ts`.

- `useXterm.ts` imports `./terminal-keys` and `./terminal-osc52` — both move with it, so those specifiers stay. Its `./ws` and `./shared/system-clipboard` imports become `../../ws` and `../system-clipboard`.
- Three non-test importers retarget `useXterm`:
  - `web/src/shared/transcript/TerminalCard.tsx`: `../../useXterm` → `../terminal/useXterm`
  - `web/src/harness/HarnessTab.tsx`: `../useXterm` → `../shared/terminal/useXterm`
  - `web/src/ShellTab.tsx`: `./useXterm` → `./shared/terminal/useXterm`
- Five test files mock or import it by path and retarget the same way:
  - `web/src/ShellTab.test.tsx`: `./useXterm` → `./shared/terminal/useXterm` (both the `vi.mock` and the import)
  - `web/src/App.test.tsx`: `./useXterm` → `./shared/terminal/useXterm` (`vi.mock` only)
  - `web/src/shared/transcript/TerminalCard.test.tsx`: `../../useXterm` → `../terminal/useXterm` (mock + import)
  - `web/src/shared/transcript/Transcript.test.tsx`: `../../useXterm` → `../terminal/useXterm` (mock only)
  - `web/src/shared/transcript/Transcript.pin.test.tsx`: `../../useXterm` → `../terminal/useXterm` (mock only)

`web/src/ws.ts` and `web/src/icons.ts` are also imported upward from `web/src/shared/`; they stay where they are — each is its own move with its own blast radius.

## Implementation

1. `mkdir web/src/shared/terminal` and `git mv` the five files into it.
2. Fix `useXterm.ts`'s two upward imports (`../../ws`, `../system-clipboard`).
3. Retarget the three source importers and five test files.
4. Run `./scripts/run.mjs check-diff` after the move and again after the rewrites.

## Tests

No new tests — this is a pure move. The moved `terminal-keys.test.ts` and `terminal-osc52.test.ts` must keep passing with only their own `./` specifiers intact, and every consumer suite (`ShellTab`, `App`, `TerminalCard`, `Transcript`, `Transcript.pin`) must stay green with retargeted mocks. A missed mock would surface as a real xterm instance in jsdom, so the suites are the safety net.

## Out of scope

- Moving `web/src/ws.ts` or `web/src/icons.ts`.
- Any behavior change to the terminal modules.
- Adding lint zones to enforce the shared layer.
