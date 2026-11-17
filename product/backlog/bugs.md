# bugs

## ready

## development

* Show the `<message>` placeholder in the bare `notify` usage reply in the shell tab's transcript

Existing Bug: Typing bare `notify` in a shell tab renders the reply as `Usage: notify .` instead of `Usage: notify <message>.`, dropping the angle-bracket placeholder. Severity: 3/10

Existing Risk: 2/10 - A user who omits the message gets a usage line that no longer names the argument it asks for, so the reply stops working as a hint on the one path where it is the only feedback; every other usage reply is unaffected.

Proposal Risk: 2/10 - Loosening the literal-usage matcher to accept leading whitespace could send other replies that merely begin with a blank line down the literal path and change their markdown rendering; a regression test over the leading-newline case keeps that contained to this shape.

Proposal: The spec promises in `product/specs/application-commands.md` that "The same is true of every single-line `Usage:` reply: the renderer treats it as command text rather than Markdown, so placeholders such as `<path>` and `<prompt>` survive alongside the flags around them." Reproduce on a freshly built app launched against scratch state: type `notify` with no message into the shell tab's command bar and read the reply beneath the echoed line. Expected: `Usage: notify <message>.`. Observed: `Usage: notify .`, with the whole `<message>` token gone. In the same build `tab focus` shows `Usage: tab focus <name>.` and `commands nope` shows `Usage: commands [enable|disable [agent|global] <command>].`, both with placeholders intact, so the defect is specific to replies that arrive with a leading newline. A captured WebSocket `rpc-reply` for the bare `notify` dispatch carries `{"dispatched":true,"output":"\nUsage: notify <message>."}`: the server sends the right text prefixed by a newline. The `run` function in `src/commands/notify.ts` appends the command echo as an entry with empty `output` and then appends the usage as a second entry with empty `input`; `executeAndCapture` in `src/capture/execute-and-capture.ts` collects each appended entry's `output` and `dispatchInTab` in `src/command/manager.ts` joins them with `\n`, which produces that leading newline. On the client, `literalUsage` in `web/src/shared/transcript/markdown.ts` gates on `/^Usage: [^\n]*\n?$/`, so a reply starting with `\n` is rejected, `marked` reads the bare `<message>` as an HTML tag, and `DOMPurify` drops it. Make `literalUsage` ignore leading and trailing whitespace when deciding a reply is a single-line usage message, escaping the angle brackets in the trimmed content while leaving the surrounding whitespace alone, so a leading newline from a multi-entry capture no longer defeats it. Attaching the usage to the echo entry in `src/commands/notify.ts` instead would work too, but the client-side change also covers any other command that appends usage as a second entry. `web/src/shared/transcript/markdown.test.ts` covers placeholder survival for single-line usage replies and `src/commands/notify.test.ts` covers the bare-command path; a regression test should render `\nUsage: notify <message>.` through `renderMarkdown` and assert the visible text is `Usage: notify <message>.`, and a shell-tab test should assert that exact text appears after a bare `notify`.

## deferred

## declined
