# Authenticate shell-tab hook markers with a per-session nonce

**Complexity: 4/10** — the change stays in the shell plugin's client: one new pure module for the hook text and the nonce, a reworked pure marker parser, and the two OSC handlers in `useShellTerminal`. No server, wire, or plugin-contract change.

## Goal

The shell tab trusts only the status markers its own zsh hooks emit. A program's output, such as a `cat` of a crafted file or a remote host reached over `ssh`, can no longer print an OSC 133 `C`, `D` or `E` sequence or an OSC 7 directory report and have the tab act on it. A forged marker changes neither the running state, nor the command history, nor the recorded working directory, and it does not clear the screen.

## Approach

Each time the terminal attaches, the client generates a random nonce with `crypto.getRandomValues` (16 bytes, hex encoded) and builds the hook-setup line from it. The nonce is written literally into the bodies of the zsh hook functions rather than into a shell variable, so a child process cannot read it from its environment. Every marker the hooks emit carries it as its second field:

- `133;C;<nonce>;<base64 command>`
- `133;D;<nonce>`
- `133;E;<nonce>`
- `7;<nonce>;file://<host><path>`

OSC 7 keeps its `file://` URL payload, prefixed by the nonce. The review also suggested a private `1337` marker carrying a base64 path. That change of encoding belongs to the separate backlog entry about decoding OSC 7 reports exactly, which already says to carry the nonce in whatever marker it settles on, so this change leaves the URL decoding as it is.

Parsing moves into pure functions in `web/src/plugins/shell/shell-command-marker.ts`. `readShellMarker(data, nonce)` returns the marker kind (with the decoded command for `C`) only when the kind is `C`, `D` or `E` and the second field equals the nonce. `readShellCwd(data, nonce)` returns the decoded path only when the first field equals the nonce and the rest is a `file:` URL. The OSC 133 handler still reports `C`, `D` and `E` as handled whether or not the nonce matched, so a forged marker is swallowed rather than drawn, and other 133 sub-markers stay unhandled as before. The OSC 7 handler keeps swallowing every report.

The history exclusion of the setup line compares the decoded command against the hook text generated for this attachment.

The nonce lives for one attachment, as the review proposed. A remount types a fresh hook line, and zsh switches to the new nonce once it runs that line. Until then, markers from the previous attachment's functions are ignored. When zsh is idle, or busy with a command that reads no input, this resolves on its own: the setup line runs and its own `E` and `D` markers carry the new nonce. When a full-screen program has the foreground, the setup line is typed into that program and the shell stays hidden until it exits. That is the existing remount problem the separate "install hooks once" backlog entry addresses, and when it lands the nonce should become stable for the life of the PTY.

## Implementation steps

1. Add `web/src/plugins/shell/shell-status-hooks.ts` with `createShellMarkerNonce()` and `shellStatusHooks(nonce)`, which returns the hook-setup line with the nonce in every marker.
2. Replace `decodeShellCommand` in `web/src/plugins/shell/shell-command-marker.ts` with `readShellMarker(data, nonce)` and `readShellCwd(data, nonce)`.
3. In `web/src/plugins/shell/useShellTerminal.ts`, generate the nonce and the hook text per attachment, write that text on attach, and route both OSC handlers through the new parsers.
4. Update `product/specs/shell-tab.md`.

## Tests

- `shell-command-marker.test.ts`: a signed `C` decodes its command, keeping unicode, quotes and newlines; a signed `C` with no or an empty payload, a whitespace-only command, or a payload that is not base64 UTF-8 text is still a `C` with no command; signed `D` and `E` are read; a marker with no nonce, a wrong nonce, or an unknown kind is not; a signed cwd report decodes its path; a cwd report with no nonce, a wrong nonce, a non-`file:` URL, or a malformed URL is not.
- `shell-status-hooks.test.ts`: two nonces differ and are 32 hex characters; the hook text carries the nonce in the `C`, `D`, `E` and OSC 7 markers.
- `useShellTerminal.test.ts`: the existing marker cases use the nonce read from the hook text the terminal wrote. New cases: markers with no nonce or a wrong nonce change neither running state, nor history, nor cwd, and do not clear the screen or reveal it, while the same markers carrying the right nonce still do; two attachments write different nonces.
- `ShellTab.test.tsx`: the existing marker cases feed signed markers, with the nonce module mocked to a fixed value.

## Out of scope

- Changing how the OSC 7 path is encoded or checking its host (separate backlog entry).
- Installing the hooks once per PTY rather than per mount (separate backlog entry).
- A program that reads the hook text from the terminal before it is cleared could still learn the nonce; the review accepted that residual risk.
- User documentation: the user guide does not describe the status markers.
