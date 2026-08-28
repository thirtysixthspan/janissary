# Force interactive terminal with an `i!` prefix

**Complexity: 2/10** — one pure parsing helper called from three existing single-entry seams (`resolveCommand`, `CaptureManager.run`, `completeCommandLine`), reusing the `pty: true` resolution and dispatch that already exist; no new module, protocol field, persistence, or UI surface.

## Summary

Interactive, full-screen programs need a real TTY, and Janissary already handles them two ways: `src/interactive.ts` auto-detects a fixed list of programs (`htop`, `vim`, `less`, …) and forces PTY takeover, and `shell --pty <cmd>` forces it explicitly for anything not on that list. The explicit escape hatch is the one that gets used when auto-detection misses — a locally-built TUI, a script that shells out to a pager, a REPL under a name the list doesn't know — but it costs twelve keystrokes before the command even starts, and it only works if the user remembers the flag exists.

This feature adds a short prefix, `i!`, that means the same thing: `i!<command>` strips the prefix and launches `<command>` in a full-tab PTY, exactly as `shell --pty <command>` does today. A bare `i!` opens the login shell in a PTY, matching bare `shell --pty`. The prefix is recognized before anything else — before built-in command matching and before probabilistic routing — so it is a deterministic escape hatch in the same way a leading `shell ` is. Nothing about the PTY takeover experience itself changes; this is a new spelling for an existing path, plus the two supporting surfaces — tab completion, and the refusal that already guards commands delivered by `msg`/`broadcast` — that have to know about the prefix for it not to feel broken.

## Design decisions

1. **The prefix is `i!`, hardcoded, exactly as written in the backlog entry.** `i` for interactive, `!` as the escape marker. Whitespace between the prefix and the command is optional: `i!htop` and `i! htop` are the same command, and leading whitespace before the prefix is tolerated the way `resolveCommand` already trims its input. The match is **case-sensitive** — `I!htop` is not the prefix — matching how the existing `--pty` flag is matched (`/^--pty\b/`, no `i` flag) even though the `shell` keyword itself is case-insensitive. A `!`-only spelling was rejected — `!` is history expansion in bash/zsh muscle memory, and the bash recognizer already scores `!` as a shell metacharacter.
2. **The prefix is recognized absolutely first, ahead of built-ins and routing.** It is parsed at the top of `resolveCommand` (`src/resolve.ts:28`, `export function resolveCommand`), before the `if (/^shell\b/i.test(trimmed))` check, before the built-in `commands` loop, and therefore before the `unknown` path that feeds probabilistic recognition. `i!agent` launches a program named `agent` in a PTY; it does not run the built-in `agent` command. This mirrors how a leading `shell ` already wins outright, and it is what makes the prefix trustworthy when a guess would be wrong.
   - Verified: the three short-circuits that run *before* `resolveCommand` in `CommandManager.run` (`src/command/manager.ts:65-80` — `input.trim().toLowerCase() === 'schedule'`, `/^harness\b/i`, `/^ssh\b/i`) are all anchored at the start of the input, so a line beginning with `i!` can never match one. No reordering of `run` is needed for decision 2 to hold; `i!ssh box` correctly opens `ssh box` in a PTY rather than creating an ssh tab.
3. **A bare `i!` opens the login shell in a PTY.** With nothing after the prefix, the behavior is identical to a bare `shell --pty`: `$SHELL` (falling back to `bash`) takes over the tab as an interactive prompt. One rule, no special case — the existing dispatch in `src/command/manager.ts:101-108` already resolves an empty command to the fallback shell, so this falls out of reusing that path rather than being added to it.
4. **`i!` produces the same `Resolution` the `--pty` flag produces.** Both spellings converge on `{ kind: 'shell'; cmd; pty: true }`, so there is exactly one downstream execution path and no second way to reach PTY takeover (architecture principle 5). `resolveCommand` has exactly one runtime consumer — `CommandManager.run` (`src/command/manager.ts:81`, `const res = resolveCommand(input)`) — so every dispatcher that funnels through it inherits the prefix for free with no further change: typed input (`dispatch`), `send` (`src/commands/send.ts:28`, `managers.command.dispatchTo`), scheduled commands (`src/schedule/manager.ts:171`), and drained queue entries. That is intended: `send <tab> i!htop` opens a PTY in the target tab exactly as typing it there would.
5. **Commands delivered by `msg`/`broadcast` reuse the existing refusal.** This is the `CaptureManager` path, not the remote-host path: `AgentCommunicationManager.handle` routes `command`- and `request`-kind messages through `CaptureManager.run` (`src/agent/communication-manager.ts:48-60`), which must return *captured text* to the sender — and a PTY takeover produces none. That path already answers `Cannot run interactive command remotely: <cmd>` for auto-detected interactive commands (`src/capture/manager.ts:12`); a prefixed command gets the same message, with the prefix stripped from the echoed command (so it reads `Cannot run interactive command remotely: htop`, not `… i!htop`). No new message and no new refusal concept — and specifically not a silent fall-through to the piped shell, which would run something other than what was asked and can hang on a program waiting for a TTY.
6. **A prefixed command typed in a remote (`agent on <host>`) tab is *not* refused — it opens a remote PTY.** Verified: `openInlinePty` (`src/pseudoterminal-manager.ts:112-118`) checks `tab?.remote` and routes to `registerRemotePty(label, channel, …)` over that tab's remote channel, letting the remote server apply its own sandbox. So the prefix works in remote tabs with no additional code, and decision 5's refusal applies only to messaged commands. Do not conflate the two: the word "remotely" in the existing message means "on another agent's behalf", not "on another machine".
7. **Command history stores the raw line, prefix included.** `recordHistory` runs at the top of `CommandManager.dispatch`/`dispatchTo` on the untouched input, so Up-arrow and `hist` recall `i!htop` verbatim and re-running it forces the PTY again. This is existing behavior, and the decision here is to leave it alone rather than normalize the stored line — the user's explicit intent is worth preserving in history. (The transcript is unaffected: PTY takeover appends no log entry, per `product/specs/shell.md`.)
8. **Tab completion strips the prefix before completing.** `completeCommandLine` splits the token at the last whitespace (`src/completion/index.ts:32-33`), so today `i!./my-scr` + `Tab` completes nothing — the `i!` is glued to the path — while `i! ./my-scr` already works. The completion entry point unwraps a leading `i!`, completes against the remainder, and re-wraps the result, so both spellings complete. This also means the derived command word (`preceding[0]`, `:37`) is the real program name, so any command-specific handler sees what it expects.
9. **Help gains its own line, worded: "Prefix a command with `i!` (or use `shell --pty`) to run it in a full-tab interactive terminal."** It goes in `help.md` as a standalone line alongside the existing `Tab`-completion paragraph, not as a row in the command table (`i!` is a prefix, not a command). The fallback help string in `src/commands.ts:47` is left alone — it is the help.md-is-missing degraded path and does not mention `--pty` either.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| Parse a PTY-forcing prefix out of raw input | `--pty` flag handling inside the `shell ` branch, returning `{ kind: 'shell', cmd, pty: true }` | `src/resolve.ts:36-41` |
| Dispatch a `pty: true` resolution into a full-tab terminal | `CommandManager.runShell` → `managers.pty.openInlinePty(label, command, program)` | `src/command/manager.ts:101-108` |
| Login-shell fallback for an empty command | `process.env.SHELL || 'bash'` inside `runShell` | `src/command/manager.ts:104-106` |
| Auto-detection of interactive programs (untouched, but the thing the prefix overrides) | `isInteractive` over pipeline segments, skipping wrappers and `VAR=` assignments | `src/interactive.ts` |
| Refusal of interactive commands delivered by `msg`/`broadcast` | `Cannot run interactive command remotely: <cmd>` guard inside `CaptureManager.run` | `src/capture/manager.ts:9-15` |
| Remote-tab PTY (so the prefix needs no remote-specific work) | `openInlinePty`'s `tab?.remote` branch → `registerRemotePty` over the tab's channel | `src/pseudoterminal-manager.ts:112-118` |
| Token/command-word derivation for completion, with a filesystem-path fallback | `completeCommandLine` | `src/completion/index.ts:22-55` |
| Raw-input history capture ahead of resolution | `recordHistory` / `recordGlobalHistory` at the top of `dispatch`/`dispatchTo` | `src/command/manager.ts:35-47` |
| Full-tab PTY behavior, multi-tab persistence, teardown on close | PTY takeover as specified | `product/specs/shell.md` "Interactive PTY takeover" |

## Proposed changes

Land them in the order below. Step 1 alone is a working feature (the prefix launches PTYs); steps 2 and 3 close the two supporting surfaces; step 4 is documentation. Each step keeps typecheck and tests green on its own, so `./scripts/run.mjs check-diff` can run between them.

### 1. Prefix parsing in `src/interactive.ts`, consumed by `src/resolve.ts`

- The prefix literal (`i!`) and its parser live in `src/interactive.ts` (35 lines today), not in `resolve.ts`. That file already owns the question "does this command need a real TTY?" via `isInteractive`; "was this command explicitly marked as needing one?" is the same responsibility, and `src/capture/manager.ts:1` already imports from `../interactive.js`. Placing it there also keeps `src/completion/` from importing `resolve.ts`, which would drag the whole built-in command catalog into the completion path for a two-character literal.
- Export a single constant for the literal plus a small pure helper that, given raw input, returns the command remainder when the input starts with the prefix and `null` otherwise. The helper tolerates leading whitespace before the prefix, strips the prefix and any whitespace directly after it, and does not otherwise alter the command. Exporting both keeps the literal from being spelled in four files and gives the resolve, capture, and completion layers one thing to call rather than three regexes to keep in sync (principle 4: pure, no I/O).
- `resolveCommand` imports the helper and calls it immediately after its empty-input check and before the `shell ` branch. On a match it returns a `shell` resolution with `pty: true` and the stripped command — the same shape the `--pty` flag already returns, including the empty-command case that `runShell` turns into the login shell. Nothing else in `resolveCommand` moves.
- `src/command/manager.ts` needs no change: it already routes any `pty: true` resolution to `openInlinePty`, and its existing comment describing the `--pty` path should be extended to name the prefix as the second spelling.

### 2. Messaged commands in `src/capture/manager.ts`

- `CaptureManager.run` checks the prefix helper before its `if (/^shell\b/i.test(text))` branch. A prefixed command resolves to the refusal message built from the *stripped* command, so it reads identically to the auto-detected case (`Cannot run interactive command remotely: htop`) and is handed to the `callback` — which is what returns text to the sending agent for a `request` message.
- A bare prefix (no command) takes the same refusal, echoing the raw input (`Cannot run interactive command remotely: i!`) so the message never trails off after the colon. Deliberately *not* resolved to the login shell name here: that would put a second copy of `process.env.SHELL || 'bash'` in this file, and the sending agent gains nothing from the shell's name.
- Ordering must be asserted in a test: the prefix check sits ahead of the `^shell` branch and ahead of the `for (const c of commands)` loop, mirroring decision 2's precedence on the local side, so the two dispatchers agree on what a prefixed line means.
- No change is needed for remote (`agent on <host>`) tabs — see decision 6.

### 3. Tab completion in `src/completion/index.ts`

- `completeCommandLine` detects a leading `i!` on the raw `input` (allowing leading whitespace), and when present delegates to the existing body with the prefix removed and the cursor shifted left by the prefix length, then re-prepends the prefix to `newInput` and shifts `newCursor` back. `matches` passes through unchanged.
- When the cursor sits inside the prefix itself, the input is passed through untouched — there is nothing meaningful to complete for a two-character marker.
- Keep the unwrap/rewrap inline in `completeCommandLine` as a guard at the top plus an adjustment of the returned `CompletionResult` — no new helper and no new file. It is a handful of lines at one call site with nothing to generalize, and `src/completion/index.ts` is 55 lines today, nowhere near the 200-line limit.
- No caller change is needed: `completeCommandLine` has one runtime consumer, `src/controller/completion.ts:13`, which passes the raw command-line text straight through.
- Import the prefix helper from `../interactive.js` with the `.js` extension (NodeNext rule). `interactive.ts` imports nothing, so there is no cycle risk from either the completion or the capture side.

### 4. Help, specs, and user documentation

- `help.md`: add the decision-9 line near the end, beside the closing `Tab`-completion paragraph (`help.md:118`) — help.md has no `shell` row in its command table, so a prose line is the only fitting placement.
- `product/specs/shell.md`: extend the "Forcing PTY mode with `--pty`" section (retitle it to cover both spellings) with the prefix, the optional space, the bare-prefix login-shell rule, and the precedence rule from decision 2. Add a sentence recording that a prefixed command works in a remote tab via the tab's channel (decision 6).
- `product/specs/messaging.md`: one sentence in the `command`/`request` bullets (`:6-7`, "dispatched through the full command pipeline") recording that an interactive command — auto-detected or `i!`-prefixed — is refused with `Cannot run interactive command remotely: <cmd>` because a PTY takeover returns no captured output. This behavior exists today and is unspecified; the prefix makes it reachable a second way, so it gets written down here rather than left implicit.
- `product/specs/command-routing.md`: extend the closing "An explicit prefix always wins" note (`:76-77`) so `i!` is listed with `shell `/`db `/`acp ` as a form that bypasses recognition entirely.
- `product/specs/tab-completion.md`: one sentence in the precedence rules (`:16`, "The shell uses the following rules, in order of precedence") stating that a leading `i!` is stripped before completion, so completion behaves as it would for the unprefixed command.
- `documentation/user-documentation/command-bar/shell.md`: the page already documents `shell --pty` (lines 73-79); add the prefix as the short form in the same section, with a `i!./some-interactive-script.sh` example matching the existing one and a note that a bare `i!` opens the login shell. How-to framing, no implementation detail, per `ai/guidelines/user-documentation.md`.

## Tests

Server tests are colocated as `src/**/*.test.ts` (vitest project `server`), matching where each touched module's tests already live.

| Area | File | Coverage |
| --- | --- | --- |
| Prefix helper (the matching matrix lives here, not duplicated through `resolveCommand`) | `src/interactive.test.ts` (beside the existing `isInteractive` cases) | Returns the stripped remainder for `i!vim file.ts`, `i! vim file.ts`, and `i!  vim` alike; an empty string for a bare `i!`; `null` for near-misses (`ihtop`, `i !htop`, `I!htop` — the prefix is case-sensitive, matching `--pty`'s own case-sensitive flag match) and for a mid-string occurrence (`echo i!x`); leading whitespace before the prefix still matches |
| Resolution shape and precedence | `src/commands/resolve.test.ts` (where the existing `--pty` cases live, `:19-22`) | `i!vim file.ts` → `{ kind: 'shell', cmd: 'vim file.ts', pty: true }`; bare `i!` → `cmd: ''`, `pty: true`; `i!agent` resolves to a shell/PTY resolution, **not** the built-in `agent` app command |
| Dispatch | `src/command/manager.test.ts` | A prefixed command reaches `openInlinePty` with the stripped command and its first token as the program; a bare prefix reaches it with the `$SHELL` fallback; a non-prefixed, non-interactive command still goes to the piped shell (regression) |
| Messaged-command refusal | `src/capture/manager.test.ts` | A prefixed command answers `Cannot run interactive command remotely: <stripped cmd>` through the callback and never calls the shell manager or `openInlinePty`; a bare `i!` is refused with the raw input echoed; the prefix check precedes both the `shell ` branch and the built-in `commands` loop |
| Completion | `src/completion/index.test.ts` | `i!./my-scr` + Tab completes the path and returns `newInput` with the prefix intact and `newCursor` offset correctly; `i! ./my-scr` (space form) still completes as it does today; a cursor inside the prefix returns the input unchanged; a prefixed command word still reaches the right command-specific handler |
| History | `src/command/manager.test.ts` | Dispatching `i!htop` records the raw line (prefix included) in command history and global history |

## Out of scope

- **A configurable prefix.** `i!` is hardcoded; no application-config setting to change or disable it.
- **Additional aliases.** No `!`-only and no `pty!` spelling — exactly one prefix ships.
- **Growing the auto-detection list.** `INTERACTIVE_PROGRAMS` in `src/interactive.ts` is left untouched; the prefix is the answer for anything not on it.
- Any change to PTY takeover behavior itself — the terminal, key forwarding, multi-tab persistence, and teardown are unchanged.
- Any change to how `shell --pty` is parsed or dispatched; it remains the long form.
- Any change to what `msg`/`broadcast` can deliver: the prefix is refused there for the same reason auto-detected interactive commands already are (decision 5), and making messaged commands capable of driving a PTY is a separate problem.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` after each step.
- Manual check: in an agent tab, run `i!htop` and confirm the tab takes over with a full-tab terminal and returns to the transcript with no log entry on exit; press Up-arrow and confirm the recalled line reads `i!htop`. Run `i!` alone and confirm a login-shell prompt takes over the tab, then `exit` back. Type `i!./` and press `Tab` in a directory containing a script, and confirm the path completes with the prefix preserved. Run `i!agent` and confirm it attempts to launch a program named `agent` rather than opening a new agent tab. From a second tab, run `msg <that-tab> command i!htop` and confirm the recipient answers `Cannot run interactive command remotely: htop` instead of taking over. Finally, in a remote tab (`agent on <host>`), run `i!htop` and confirm the takeover happens on the remote machine (decision 6).
