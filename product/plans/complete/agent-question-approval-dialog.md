# Agent question / approval dialog commands

**Complexity: 6/10** — adds a new asynchronous command to the ACP tool loop, an in-memory per-tab question registry, a client answer RPC, a non-modal per-tab panel, and linked notifications.

## Summary

Let an ACP agent pause its tool loop and ask the human for either free text or a choice. The agent emits `question ask "<question>"` or `question approve "<question>" <option> [<option> …]` on the final line of its reply. Janissary removes the command from the displayed reply, opens a panel on the owning tab, waits for the human, and returns the answer to the same agent as command output.

This is an in-process agent command. It does not expose a `janus` launcher subcommand, HTTP endpoint, shell command, environment variable, harness PTY integration, or external client transport.

## Design decisions

1. **Use the ACP tool loop.** Questions follow the existing database and browser command pattern: a primer teaches the syntax, an extractor finds the final command, and the asynchronous result becomes the next tool-loop prompt.

2. **Two command forms share one registry.** `question ask` collects free text; `question approve` restricts the answer to one supplied label. Both use the same pending-question state and answer RPC.

3. **Quoted arguments make the grammar unambiguous.** The question is quoted. Approval labels containing spaces are also quoted.

4. **The panel is non-modal and per-tab.** Other tabs and controls remain usable. Different tabs may have questions concurrently.

5. **One visible question per tab.** A second request for the same tab queues until the first resolves.

6. **Cancellation is explicit agent output.** Cancel, tab close, and server shutdown return `Question cancelled.` to the waiting agent.

7. **Nothing is persisted.** Pending questions and their queues exist only in memory.

8. **Background questions notify.** When the asking tab is not active, the notifications feed receives `Question from <tab>` with a link back to that tab.

## Proposed changes

### Agent command

Add a pure question-command module that:

- parses `question ask` and `question approve` with quoted arguments;
- extracts a question command from the final line of an agent reply;
- provides primer text describing the command contract;
- registers a valid command with the owning tab's question registry;
- returns usage text for malformed commands.

Extend the ACP manager's tool loop to include the primer, extraction, and asynchronous execution path.

### Question registry

Add an in-memory registry keyed by tab label. Each active entry contains an id, kind, question, optional approval labels, and a promise resolver. Queue later questions from the same tab. Expose the active entry in the tab view, validate answers, promote the next queued entry after resolution, and resolve active and queued entries when the tab or server closes.

### RPC and client

Add pending-question data to each tab view and an `answerQuestion` RPC carrying the tab, question id, and either an answer or cancel marker. Render a non-modal panel on the owning tab:

- `ask` shows a text input, Submit, and Cancel;
- `approve` shows one button per option and Cancel.

### Notifications

Add an always-eligible `question` notification event for background asking tabs. Store the owning tab label on the notification line and make its tab badge focus that tab.

### Skill and spec

Add an `ask-user` skill teaching ACP agents to emit the two commands. Add an agent-questions spec and cross-reference it from the harness and notifications specs.

## Tests

- Question command parsing, extraction, malformed usage, and registry dispatch.
- ACP tool-loop primer, extraction, and asynchronous question output.
- Registry exposure, answer validation, cancellation, tab close, and per-tab queue ordering.
- Pending-question tab views and answer RPC routing.
- Background notification eligibility, formatting, metadata propagation, and linked tab navigation.
- Ask, approve, and cancel panel behavior plus non-modal interaction.

## Out of scope

- Shell or launcher commands such as `janus ask` / `janus approve`.
- HTTP question endpoints or external callers.
- Harness PTY, shell-script, editor-agent, or monitor-agent question sources.
- Timeouts, caller-supplied defaults, persistence, rich forms, and multi-select answers.

## Implementation order

1. Build and test the registry.
2. Add the answer RPC and pending-question tab view.
3. Add notifications and owning-tab navigation.
4. Add the ACP question parser, extractor, primer, and execution path.
5. Add the non-modal panel.
6. Update the skill and functional specs.

Run `./scripts/run.mjs check-diff` after each step and the full PR gate before updating the open pull request.
