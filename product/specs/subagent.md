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

### Task prompt

A subagent is told it is a subagent and asked to finish with a self-contained final result for the agent that launched it. The task text follows verbatim, then the optional context verbatim. The task prompt does not repeat the command protocol primer and adds no summarizing turn or output cap.

### Records and names

A subagent run's durable record carries the canonical role name. Its title is `Subagent: <task filename>` from the task selector captured at launch, without the ACP title cap; later task resolution, a task snapshot replacement, and caller renames never change it. In the connections tab, and as its own connection tab's title, the record is named `subagent:<canonical role>`. In the caller's connections popup it appears as an ACP-kind row titled `Subagent: <task filename>` while the run is live, with no ACP reference, and leaves the popup when the run ends. Ordinary agent and ACP names are unchanged.

A run stopped at the tool-loop limit closes its record with the `Partial` outcome, which reads `Partial` as a terminal status in the connections list, the connection tab, and the agent monitor. It owns the first outcome like `Completed` and does not abort the run's controller. A terminated subagent record saves `Subagent terminated.` as its answer, regardless of an earlier response; an ordinary agent run saves `Agent terminated.` instead.

### Boundaries

The grammar, messages, and task prompt are pure. They neither register the command nor check grants, roles, models, caller kind, workspaces, launch, delivery, or I/O. Caller-kind enforcement and response handling belong to command dispatch.
