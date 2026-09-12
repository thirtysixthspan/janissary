# Honor a harness's own clipboard writes so copying works in a remote harness tab

**Complexity: 3/10** — one pure decoder module beside `terminal-keys.ts`, one handler registration in the shared xterm construction, and its disposal. No new components, no protocol change, no server-side change.

## The bug

> copying text from remote harness tabs for claude and opencode does not work, but works for all local harness tabs.

## Root cause

Copying out of a terminal happens two ways, and only one of them is the terminal's own.

The terminal's own way — force a selection with Option/Shift+drag, then `Cmd+C`/`Ctrl+Shift+C` — is entirely client-side, and a remote harness tab renders through exactly the same `useXterm` terminal as a local one. Remote output crosses the ssh channel base64-encoded inside its frame (`src/remote/protocol.ts`), so the bytes a remote harness paints are identical to a local one's. Nothing there can differ between the two.

The other way is the harness's own copy command, and that one *is* machine-specific. A harness asked to copy something first tries the clipboard of the machine it is running on — `pbcopy` and its kind. Running locally, that machine is the user's, so the text lands where the user expects. Running on the far side of `on <host>`, that machine is the remote, and the harness falls back to asking the terminal instead, with an **OSC 52** escape sequence (`ESC ] 52 ; c ; <base64> BEL`) — the terminal-standard way for a program to reach the clipboard of the human watching it, and the reason copying over ssh works in every other emulator.

Both harnesses named in the report do exactly this. claude's binary carries the decision trace `clipboard: setClipboard mux=… ssh=… native=… predicted=… emit=… bytes=…` next to its `]52;c;` emitter, along with the tmux and `screen` passthrough wrappings; opencode's carries `` `\x1B]52;c;${Buffer.from(j).toString("base64")}\x07` `` written straight to its tty.

Janissary's terminals throw that away. xterm.js registers built-in OSC handlers for 0, 1, 2, 4, 8, 10, 11, 12, 104, 110, 111 and 112 — there is no 52 among them, deliberately, because writing the clipboard is the embedder's decision to make. `useXterm` registers none of its own, so the sequence is parsed and dropped, and the harness's copy silently does nothing.

## Reproduction

`temp/osc52-repro.mjs`, against `@xterm/headless` — the same parser and core as the `@xterm/xterm` build the app renders with — writing the exact sequence claude emits over ssh:

```
$ node ./temp/osc52-repro.mjs
terminal as useXterm.ts builds it
  clipboard writes seen : 0 (the sequence was parsed and dropped)
same terminal with an OSC 52 handler registered
  handler data          : "c;Y29waWVkIGZyb20gYSByZW1vdGUgaGFybmVzcw=="
  decoded clipboard text: "copied from a remote harness"
```

Supporting observations from the two harnesses named in the report:

```
$ (scan the binaries for the OSC 52 emitter)
claude   … clipboard: setClipboard mux= … ssh= … native= … predicted= … emit= … bytes= …]52;c;…
         … if(r==="tmux"){…]52;c;…}  if(r==="screen"){…]52;c;…}
opencode … function jy(j){if(!process.stdout.isTTY)return;
           let T=`\x1B]52;c;${Buffer.from(j).toString("base64")}\x07`;process.stdout.write(T)}
```

As an automated failing test: `web/src/harness/HarnessTab.test.tsx` → "puts a harness's OSC 52 clipboard write on the system clipboard" finds that nothing ever registered an OSC 52 handler on the terminal, so the harness's copy has nowhere to land.

## Correct behavior

When a program running in a harness tab asks the terminal to put text on the system clipboard with an OSC 52 sequence, that text reaches the user's clipboard — so a harness's own copy command works in a remote harness tab exactly as it does in a local one. A read request (`ESC ] 52 ; c ; ? BEL`) is answered with nothing rather than disclosing the clipboard back to the program, and a payload that is not valid base64 is ignored rather than copying garbage.

## Approach

**Handle OSC 52 in `useXterm`, not in `HarnessTab`.** The gap is in the shared terminal construction, and a program that asks the terminal for the clipboard is not peculiar to harness tabs — a shell tab's PTY takeover and a transcript terminal card run the same kind of program. This is where `macOptionClickForcesSelection` and the key translations already live, and the harness spec already says selection and copy behave the same way in every xterm.js terminal in the app.

**A pure decoder beside the key predicates.** `web/src/terminal-osc52.ts` turns the handler's raw data (`"c;<base64>"`) into the text to copy, or `null` when there is nothing to copy — the query form, an empty payload, a malformed selection spec, or base64 that will not decode. Pure, so every one of those cases is testable without a render, exactly like `terminal-keys.ts`.

**Write through the shared `copyText`.** `web/src/shared/system-clipboard.ts` is already the one place that writes the system clipboard and swallows a withheld or denied clipboard; the file navigator and the default context menu both go through it. The terminal joins them rather than reaching for `navigator.clipboard` again.

**Write only, never read.** OSC 52's read form asks the terminal to send the clipboard's contents *back to the program* as input. Handling it would hand a harness — local or remote — whatever the user last copied, which is not a thing a copy feature needs. The handler consumes the query and answers nothing.

## Implementation steps

1. `web/src/terminal-osc52.ts` — new module: `osc52ClipboardText(data: string): string | null`, decoding the base64 payload as UTF-8 and returning `null` for the query form, an empty payload, and anything that fails to decode.
2. `web/src/useXterm.ts` — register the OSC 52 handler on the terminal (`term.parser.registerOscHandler(52, …)`), passing a decoded payload to `copyText`, and dispose the registration alongside the other subscriptions in the effect's cleanup.
3. `product/specs/harness.md` — under "Selecting and copying terminal text", record that a harness's own copy command reaches the clipboard too, and that this is what makes copying work in a remote harness tab.
4. `documentation/user-documentation/advanced-agents/harness.md` — extend "Copying text out of a harness" with the harness's own copy command and the remote case.

## Regression test

- `web/src/terminal-osc52.test.ts` — the decoder: a base64 payload decodes (UTF-8 included), the `?` query form returns `null`, an empty payload returns `null`, data with no selection separator returns `null`, and undecodable base64 returns `null`.
- `web/src/harness/HarnessTab.test.tsx`, under "selecting and copying terminal text" — the only test file that drives the real `useXterm` through a mocked `Terminal`, so the parser registration is observable:
  - **puts a harness's OSC 52 clipboard write on the system clipboard** — the captured OSC 52 handler, fed what claude emits over ssh, writes the decoded text to the clipboard and reports the sequence handled. Fails without the fix: no handler is ever registered.
  - **ignores an OSC 52 clipboard read request** — the `?` form writes nothing.

## Out of scope

- **Answering an OSC 52 read request.** Deliberate; see the approach above.
- **The `pbcopy`-on-the-wrong-machine half.** When a harness decides it can reach a native clipboard on the remote host, the text goes to *that* host's clipboard and nothing crosses the wire to act on. Only the harness can make that call, and both harnesses named already fall back to OSC 52 over ssh.
- **Selecting text with the mouse and the copy chords.** Those work in a remote harness tab today, for the reason the root cause gives: that path is entirely client-side and identical for both.
- **tmux/`screen` passthrough wrappings.** A harness running under a multiplexer on the remote wraps its OSC 52 in that multiplexer's own envelope, which the multiplexer unwraps; the terminal still receives a plain OSC 52.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step, plus re-running `temp/osc52-repro.mjs`.

Manual: in a live app, a program in a harness tab that emits an OSC 52 sequence puts its payload on the system clipboard.
