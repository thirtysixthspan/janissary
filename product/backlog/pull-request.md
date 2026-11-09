<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the blocked-command RPC spec so it covers the consumed command-bar `quit` and `close` lines, not only keyboard shortcuts.

Existing Issue: product/specs/websocket-rpc.md defines `reportBlockedCommand` as reporting a keyboard shortcut the client blocked, while the repair now also uses it for a disabled command-bar `quit` or `close` line whose canonical word is consumed and reported. Severity: 2/10

Existing Risk: 2/10 - A reader implementing or reviewing the RPC sees a shortcut-only contract and can miss the command-bar caller or describe the new behavior as an undocumented use of the RPC.

Proposal Risk: 1/10 - The spec describes the same request, acknowledgement, and server re-check; only the caller description changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "document command-bar quit and close reports in the blocked-command RPC spec". In product/specs/websocket-rpc.md's "Blocked-command reports" section, change the opening sentence to say the RPC reports a keyboard shortcut or a command-bar `quit`/`close` line the client blocked because its command appeared disabled in the client's last state snapshot. Keep the request example, the string validation, the unknown-tab no-op, the server re-resolution, the acknowledgement, and the no-dispatch guarantee unchanged. Cross-reference product/specs/application-commands.md's disabled quit/close paragraph rather than restating the notification rules. No code or test changes; the existing src/message/handler.test.ts and src/client-params/core.test.ts cases already cover the envelope.


* Correct the new help and user documentation that misstates how disabled commands are refused, especially for consumed `quit`/`close` lines and bare `search`.

Existing Issue: help/commands.md says a disabled command's line reaches the server and that its confirmation never opens, help/search.md says bare `search` does nothing, and documentation/user-documentation/command-bar/commands.md says a disabled command's line reaches the server; a disabled command-bar `quit`/`close` line is consumed and reported, a `Cmd+W`/tab-strip last-tab confirmation still opens, and bare `search` is refused with `Command is disabled: search.` Severity: 3/10

Existing Risk: 3/10 - Users and future writers follow the wrong refusal mechanism, expect a tab refusal for a disabled quit/close that never appears, and repeat the wording in later help or docs pages.

Proposal Risk: 1/10 - The documentation matches the shipped behavior; only wording changes, with no code or test impact.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "correct the disabled-command refusal wording in help and user documentation". In help/commands.md, rewrite the note to say a disabled command's picker, shortcut, or command-bar confirmation does not open or run; non-quit/close command-bar lines are offered to the server and refused there, while a disabled `quit`/`close` line is consumed and reported with the existing `command-disabled` notification as its only feedback when the ambient toggle and focus rules allow it, and the `Cmd+W`/tab-strip last-tab confirmation still opens before its dispatched `quit` is refused. In documentation/user-documentation/command-bar/commands.md, make the same distinction in the existing disabled-command paragraph while keeping its command-bar qualifier. In help/search.md, say bare `search` is refused with the server's `Command is disabled: search.` output, `Cmd+Shift+F` is blocked, and `search transcript` is refused instead of opening the find overlay, with `Cmd+F` still opening the empty find. Keep help/close.md and help/quit.md unchanged because they already state the last-tab confirmation path correctly.
