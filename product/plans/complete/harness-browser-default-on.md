# Harness E2E browser on by default, `--no-browser` to opt out

**Complexity: 3/10** — a default flip in the harness command parser, the matching default in the New harness dialog and in profile entries, and documentation. The browser machinery itself is untouched.

## Goal

A harness tab gets its end-to-end browser without asking for it. `harness claude` behaves as `harness claude -b` does today, and a new `--no-browser` flag turns it off. This follows the shape the other two harness defaults already have: `--no-workspace` and `--no-auto-approve` opt out, and `-w` and `-y` confirm the default.

## Approach

1. **Parser.** In `parseHarnessFlags` (`src/harness/command-parse.ts`), `browser` becomes `!tokens.some(--no-browser)`. `-b`/`--browser` stays accepted and explicitly confirms the default; when both forms are present `--no-browser` wins, matching `--no-workspace` against `-w` and `--no-auto-approve` against `-y`. Keeping `-b` accepted means existing habits, scripts, and task docs that pass it keep working.
2. **Dialog.** The New harness dialog (`web/src/harness/HarnessLaunchDialog.tsx`) starts with **E2E browser** checked, and `buildHarnessLaunchCommand` emits `--no-browser` when it is unchecked instead of `-b` when it is checked, mirroring how it already builds `--no-workspace` and `--no-auto-approve`.
3. **Profiles.** `openFromProfile` (`src/harness/manager.ts`) reads `entry.browser ?? true`, as it already reads `workspace ?? true` and `autoApprove ?? <supported>`. A hand-written entry that omits the field now gets the command's default. A `profile save`d entry always records the boolean, so saved sessions reopen exactly as they were.

The browser starts lazily on first connect, so a default-on tab whose harness never drives a browser costs only the guard's listening endpoint. That is what makes a default-on flag reasonable.

## Left alone deliberately

- `--offline` stays contradictory with the browser rather than turning it off. Both apply, and the offline profile denies the route to the browser. With the browser now on by default this combination is what a bare `--offline` launch gets, so the docs tell the user to add `--no-browser` alongside `--offline`.
- A `--no-workspace` launch still gets a browser by default. The existing trust warning for unconfined browsers now points at `--no-browser` as the way to avoid one.
- Reattaching a remote session (`src/sessions/attach.ts`) and the remote server's wire default (`src/remote/serve-processes.ts`) are unchanged. The first reopens an existing process, and the second is the far side of the wire, where the local side always sends the flag explicitly.

## Implementation steps

1. `src/harness/command-parse.ts`: flip the default, add `--no-browser`, update the doc comments.
2. `src/harness/manager.ts`: profile entries default to `true`.
3. `web/src/harness/harness-launch-command.ts` and `web/src/harness/HarnessLaunchDialog.tsx`: default checked, emit `--no-browser`.

## Tests

- `src/harness/command-parse.test.ts`: a bare launch has `browser: true`; `--no-browser` (any case) turns it off; `-b`/`--browser` still parse as on; `--no-browser` wins over `-b`; existing whole-object expectations move to the new default.
- `src/harness/manager-browser.test.ts`: a launch with no flag injects both browser variables; `--no-browser` injects neither.
- `src/harness/manager.test.ts`: a profile entry without `browser` opens with a browser, `browser: true` does too, and `browser: false` opens without.
- `src/harness/manager-browser-remote.test.ts`: a remote launch's spawn options carry `browser: false` only with `--no-browser`.
- `web/src/harness/harness-launch-command.test.ts`: no flag when the browser is on, `--no-browser` when off.
- `web/src/harness/HarnessLaunchDialog.test.tsx`: the checkbox defaults on, unchecking it appends `--no-browser`, and the remembered state survives reopen.
- Any other test pinning `browser: false` for a bare `harness` launch moves to the new default.

## Spec and docs

- `product/specs/harness.md`: usage line, dialog default, the end-to-end browser section, the `--offline` paragraph, and the flag parsing rule.
- `product/specs/profiles.md`: the harness entry field list gains `browser` and its default.
- `product/specs/tabs.md`: the metadata row's browser flag is described as every harness tab not launched with `--no-browser`.
- `help.md`: the `harness` row lists `--no-browser` among the opt-outs.
- `documentation/user-documentation/advanced-agents/harness.md`, `automation/profiles.md`, `advanced-agents/workspacing.md`, `advanced-agents/remote-agents.md`, and `getting-started/tabs.md` wherever they describe `-b` as the way to get a browser.

## Out of scope

- Making `--offline` imply `--no-browser`.
- Any change to how the browser starts, is guarded, or is torn down.
