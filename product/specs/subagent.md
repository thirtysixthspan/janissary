# Subagent

### Invocation forms

`subagent` starts a background agent run for a named role, gives it an existing AI task file plus optional context, and hands a distilled result back to whoever started it. The command token is matched regardless of case. A person uses the flag form; an agent in an `ask` or `tell` session uses the JSON form.

The flag form is `subagent --role <role> --task <file.md> [--context <text>]`. Flags may appear in any order, and a role or context containing spaces is written as one quoted value; escaped matching quotes are preserved as literal characters. The JSON form is one line holding an object, `subagent {"role":"<role>","task":"<file.md>","context":"<text>"}`; context may be omitted or empty, and embedded newlines in string values are escaped so the command stays on one line. Form selection happens before decoding: an argument whose first non-space character is `{` is JSON, and everything else — including arrays, scalars, and quoted JSON — is flags.

Only `role`, `task`, and `context` are accepted. Unknown or removed fields and flags (including model and effort), repeated or valueless flags, extra positional text, non-string values, invalid JSON, and a missing or whitespace-only role or task are refused. String contents pass through unchanged; trimming is used only to decide whether a required value is present.

### Usage errors

Bare `subagent` and every flag-form failure return exactly `Usage: subagent --role <role> --task <file.md> [--context <text>]`. Every JSON-form failure returns exactly `Usage: subagent {"role":"<role>","task":"<file.md>","context":"<text>"}`. Which form a caller must use, and how a refusal reaches it, is decided by command dispatch.

### Command primer

The caller-facing primer teaches the one-line JSON grammar with escaped newlines, that the command returns nothing immediately and does not block, and that results arrive later as new prompts each holding one JSON object. A `started` message carries `status`, the canonical `role`, `sessionId`, and `callerId`, and means the subagent is running in the background. A completion carries `status`, `sessionId`, `callerId`, and `output`. Session ids are provider ids; a failed completion may carry a null session id, and a `started` message may be skipped when its completion overtakes it. Provider ids are taken from the agent's own handshake rather than minted by Janissary, so a run whose handshake never completes has none; that provider id stays separate from the internal session identity that prompts and `startAcp` report. Completion statuses are `completed` (finished successfully), `partial` (stopped at the tool-loop limit), `failed` (the output is the source error), and `terminated` (stopped). The primer lists no roles and consults no role descriptions.

### Provider ids on remote runs

On a remote run the far side reports the provider id as soon as its `newSession` succeeds, ahead of effort configuration and readiness, so a failed effort setup cannot discard an id whose handshake already completed. A normal readiness frame may carry the same id as an optional field, but readiness timing is unchanged. A caller keeps the first id it observes for `started` and the most recent id from a completed handshake for an outcome, with no id meaning `null`; none of these ids is the internal session identity.

### Message contract

A `started` message holds exactly the fields `status`, `role`, `sessionId`, and `callerId`, in that order, with the status set to `started` and the role set to the canonical role name. A completion holds exactly the fields `status`, `sessionId`, `callerId`, and `output`, in that order, with a status of `completed`, `partial`, `failed`, or `terminated`. A completion carries no role and a `started` message carries no output. Both ids are the provider ids the harness reported for the subagent and its caller. They pass through verbatim: no id is minted, replaced with an internal session identity, or inferred, and a completion whose subagent never completed a handshake carries a null session id.

Each delivered message is one physical JSON line whose fields appear in the order above. Output is JSON-escaped so embedded newlines, quotes, and backslashes stay on that line, and decoding the line recovers the original text. Internal run, caller-incarnation, caller-role, and session-identity values are never part of the delivered message.

### Caller ownership

At launch a subagent captures its caller's role (`ask` or `tell`), the caller session's internal identity token, and the caller's provider id as a snapshot. Later changes to the launch options or to the caller session do not change that snapshot. The captured provider id stays distinct from the internal session identity, and none of the captured values is written into the run's durable record or its monitor view.

### Pending delivery queue

Messages waiting for a caller form a queue owned by that caller tab and role. The `ask` and `tell` roles on one tab, and the same role on two different tabs, hold independent queues. Within a role, messages are appended in arrival order. When a completion for a run is queued, any `started` message for that same run still waiting in the queue is dropped; other runs' waiting `started` messages and already-queued completions keep their positions and relative order, and the completion is appended at the tail. A `started` already taken out for delivery is unaffected. Queues never merge messages, replace an earlier position with a completion, or deduplicate completions. The queue holds pending messages only: it does not send a head message or start a prompt.

### Session-bound delivery

A queued message is admitted only while the caller tab is the same live incarnation, its role session still holds the identity captured at launch, and the agent manager is not shutting down. A message that fails this check is dropped without a prompt, echo or reply, and the next ready message is considered in its place. Once admitted, the one-line JSON is the prompt's complete logical input: no role prefix or wrapper is added, and the ordinary tool primer still precedes it at the provider boundary. The message then behaves like any other prompt in the caller role — a refusal is its reply, a reset may answer `ACP session closed.`, and fallback may answer from a replacement session.

One message runs per prompt in arrival order within each tab and role, and each publishes its own background reply under the echo `<caller role> ← subagent:<canonical role> <status>` before the next starts. A queued `started` that has not been dispatched is dropped by its own completion, but one already dispatched keeps its own prompt before that completion. Reset, session close, dead agents and fallback all clear that session's queue and terminate its still-live subagents before settlement; a label reused for a later tab incarnation receives neither a stale prompt nor an old reply.

### Human wording

The Markdown reply for a started subagent is exactly `Subagent <role> started.` The completion reply is exactly `Subagent <role> <status>.`, followed by two newline characters and then the output verbatim. The role keeps its canonical spelling and spacing. Output text — Markdown, indentation, trailing whitespace, and an empty output — is preserved without an added suffix and without removing the blank line. Neither reply prints a session id, and no caller or session ids are needed to format either reply.

### Task prompt

A subagent is told it is a subagent and asked to finish with a self-contained final result for the agent that launched it. The task text follows verbatim, then the optional context verbatim. The task prompt does not repeat the command protocol primer and adds no summarizing turn or output cap.

### Single-entry execution

One admitted role entry drives one attempt through a local or remote session. Its launch forwards the entry's command, arguments, environment and session metadata unchanged. Locally the session is confined to the run's clone and uses the captured caller's offline setting, with no approval-granting options, separate effort, installed skills or autonomous flag; provider permission requests stay denied. Remotely it uses the caller's already-established channel and its selected workspace label, with a transport address private to that attempt that is never used as a provider id. Neither form discovers a channel, provisions a clone, registers an ACP resource, or chooses another entry.

The attempt's logical input is the subagent lead-in, the task text and the optional context, recorded once. The ordinary command primer is added only at the provider boundary, on the raw first prompt, so the recorded and loop inputs contain no automatic primer. The snapshot uses the `ask` shape, the canonical role name, the role's commands with `subagent` removed, and the captured native settings; mutable role and native settings are not read again during the attempt, and no `subagent` row is added.

The result reports the verbatim text of the latest completed turn, whether any turn completed, and why the attempt ended: answered, capped, error or terminated. An answered attempt is completed, a capped attempt is partial, and every other ending is failed or terminated with the source error text unchanged, including the exact message for a harness with no adapter. Chunks, thoughts, tool results and commands never become the final output; an empty final turn is a valid completed answer, and a capped result carries no explanatory suffix. A failure before any turn reports no completed turn, while a failure after one keeps that flag set. The exact provider session id reported by the harness is retained as soon as it arrives, even if effort selection or readiness then fails; connection errors, loop errors, synchronous setup or observer throws, and disposal never replace an already-chosen status, output, turn flag or id.

Provider activity and native command start/result activity are recorded separately from the terminal output, with remote workspace steps tagged by the selected host. Acquired sessions close exactly once, whether the attempt ends by answer, termination, abort, adoption or explicit disposal. Disposal before any other ending selects terminated with `Subagent terminated.`; a failed or unacknowledged close becomes a cleanup warning beside the result instead of replacing it, and a run's own teardown waits for the attempt's allocation. Selecting another entry, settling the run and delivering messages remain the work of later layers.

### Records and names

A subagent run's durable record carries the canonical role name. Its title is `Subagent: <task filename>` from the task selector captured at launch, without the ACP title cap; later task resolution, a task snapshot replacement, and caller renames never change it. In the connections tab, and as its own connection tab's title, the record is named `subagent:<canonical role>`. In the caller's connections popup it appears as an ACP-kind row titled `Subagent: <task filename>` while the run is live, with no ACP reference, and leaves the popup when the run ends. Ordinary agent and ACP names are unchanged.

A run stopped at the tool-loop limit closes its record with the `Partial` outcome, which reads `Partial` as a terminal status in the connections list, the connection tab, and the agent monitor. It owns the first outcome like `Completed` and does not abort the run's controller. A terminated subagent record saves `Subagent terminated.` as its answer, regardless of an earlier response; an ordinary agent run saves `Agent terminated.` instead.

### Workspace ownership

A subagent run always uses a fresh workspace. It never borrows the caller's directory and never selects a named workspace, even when the caller is running in a tracked workspace. The run and its durable record are published synchronously at launch with the canonical role name and the original task selector, while the clone is scheduled for a later turn. The clone's creator reference transfers to the run's lease, so releasing the run deletes only that clone and leaves the caller's tracked workspace intact. Cleanup cancels provisioning and waits for clone readiness before releasing the lease. A run that ends before cloning begins schedules no clone and reports `git clone cancelled.` through readiness. A workspace refusal or a clone failure settles the record failed with the original error and no fabricated prompt. A run-creation refusal is instead propagated as a failed launch result with no clone and no durable record created — the run and its record are never published, so there is no record to settle. A final lease-removal failure is only a cleanup warning. This is the internal run-launch contract; it does not by itself wire a public subagent launch.

### Boundaries

The grammar, messages, human wording, pending queue, and task prompt are pure. They neither register the command nor check grants, roles, models, caller kind, workspaces, launch, delivery, or I/O. Caller-kind enforcement and response handling belong to command dispatch.
