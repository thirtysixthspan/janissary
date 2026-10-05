# Decode shell working-directory reports exactly

**Complexity: 4/10** — the change stays in the shell plugin's client: the hook text, the pure directory-report parser beside the other marker parsers, and the tests that feed directory reports. No server, wire, or plugin-contract change.

## Goal

A shell tab records the directory zsh is in byte-for-byte, whatever characters its name contains. After `cd` into a directory whose name holds `#`, `?`, `%`, a literal `%41`, a backslash or a space, the metadata row, the file navigator, new shells and new agents all use that exact directory. A directory report the tab's own hooks did not print, such as one a remote host sends over `ssh`, is ignored.

## What the code does today

`_janus_emit_cwd` in `web/src/plugins/shell/shell-status-hooks.ts` prints `OSC 7;<nonce>;file://$HOST$PWD` with `$PWD` written raw, and `readShellCwd` in `web/src/plugins/shell/shell-command-marker.ts` parses everything after the nonce with `new URL` and `decodeURIComponent(url.pathname)`. Because the path was never percent-encoded, the URL parser reads it wrongly: `#` and `?` start a fragment or query and truncate the path, a bare `%` makes `decodeURIComponent` throw so the report is dropped and the recorded directory goes stale, a literal `%41` decodes to `A`, and `\` is normalized to `/`. The hostname is never looked at.

The review's other concern, a report from another host being recorded as a local path, no longer holds as written. Since the marker-nonce change, a report counts only when it carries the nonce, and the nonce exists only inside the hook functions of the one zsh the tab installed them in. Those functions are not inherited by child shells and never reach a remote host, so every signed report comes from the local zsh. An `ssh` session's own OSC 7 carries no nonce and is already ignored.

## Approach

The directory report moves to the same encoding the command-start marker already uses: base64 of the raw bytes. `_janus_emit_cwd` prints `OSC 7;<nonce>;<base64 path>`, built with `print -rn -- "$PWD" | base64 | tr -d '\n'` exactly as `_janus_preexec` builds its command payload. There is no URL to parse, so no character in the path has a special meaning, and the decoded bytes are the directory zsh reported.

The `file://<host>` prefix is dropped rather than checked. The only zsh that can sign a report is the local one, so its `$HOST` would always be the local host and comparing it could never reject anything. A report in the standard `file://` form, nonce or not, is not valid base64 and is ignored.

`readShellCwd(data, nonce)` keeps its signature. It checks the nonce as before, then decodes the rest as base64 UTF-8 with the fatal decoder `decodeShellCommand` already uses, returning `undefined` for anything that is not base64, is not valid UTF-8, or decodes to an empty string. The shared base64 decoding is pulled into one private helper used by both parsers. The server's existing check that a recorded directory is an absolute path in normal form stays the last word.

Rejected alternative: percent-encoding the path in zsh. A correct byte-wise URL encoder in zsh needs `extendedglob` and per-byte arithmetic over a multibyte string, which is more hook text to get wrong than a pipe into `base64`, and it still leaves a URL parser between the shell and the path.

## Implementation steps

1. In `web/src/plugins/shell/shell-status-hooks.ts`, change `_janus_emit_cwd` to print `\033]7;<nonce>;%s\a` with the base64-encoded `$PWD`.
2. In `web/src/plugins/shell/shell-command-marker.ts`, extract the base64 UTF-8 decoding into a private helper and make `readShellCwd` use it instead of `new URL` and `decodeURIComponent`.
3. Update the tests listed below.
4. Update the marker list in `product/specs/shell-tab.md` and state that the reported directory is recorded exactly as zsh reports it.

## Tests

- `web/src/plugins/shell/shell-command-marker.test.ts`: a signed report decodes paths containing `#`, `?`, `%`, a literal `%41`, `\`, spaces and non-ASCII characters byte-for-byte; a report in `file://` URL form, whether from another host or the local one, is ignored; a signed report that is not base64, not UTF-8, or empty is ignored; unsigned and wrongly signed reports are still ignored.
- `web/src/plugins/shell/shell-status-hooks.test.ts`: the OSC 7 hook prints the nonce followed by the base64 of `$PWD`.
- `web/src/plugins/shell/useShellTerminal.test.ts` and `web/src/plugins/shell/ShellTab.test.tsx`: the existing directory-report cases feed what the real hook now emits (the base64 path), including the `child dir` case.

## Out of scope

- Path bytes that are not valid UTF-8: such a report is ignored and the recorded directory stays where it was, as the review accepted.
- User documentation: the user guide says the metadata row follows zsh's directory but does not describe the report format, so nothing there changes.
