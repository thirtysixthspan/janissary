# ACP session records

The backend retains project-scoped records for core ACP sessions and agent runs independently of their tabs and processes. This checkpoint delivers the recording service and its lifecycle. Live ACP and agent feeds arrive in the next step; production sessions do not yet create these records automatically. See [[acp]].

### Identity and provenance

Each accepted begin creates a fresh UUID, independent of the transient ACP session identity or agent run id. Sources distinguish core ACP from agent runs. Both supply a nonempty model, original owner label, and copied owner display name. An agent additionally supplies a nonempty run id and task path. Invalid metadata throws `Invalid ACP record source.` without creating a record.

Owner metadata is a snapshot. Closing a tab or reusing its label cannot replace the retained owner name. Records contain only tracked ACP and agent history; conversations, monitors, editor persona sessions, and other connection kinds are not recorded here.

### Titles and statuses

A core record starts as `ACP`. Its first accepted prompt fixes the title to `ACP: <first line>`, capped at 60 JavaScript string characters including the prefix. The first line is trimmed, including a CR line terminator. An empty first line keeps `ACP`, even when later lines contain text. Subsequent prompts do not retitle it. An agent title is `Agent: <task filename>` without that cap. Original prompt and activity text remain intact.

Status is derived. An open core record is `Idle` before its first prompt and between settled prompts, and `Running` while its newest block is unanswered. An open agent record is always `Running`, including after an answer, until closed. Terminal status is the recorded outcome: `Closed`, `Completed`, `Failed`, or `Terminated`.

### Prompt blocks and activity

A non-whitespace prompt starts one chronological block only while the record is open and has no unanswered block. Overlapping prompts are rejected without queuing or altering the active block. Each block retains its prompt, start time, ordered activity entries, and an optional final answer and end time.

Activity is accepted only on an open unanswered block, with a recognized kind (`message`, `thought`, `tool`, `plan`, or `permission`) and nonempty text. Whitespace-only chunks are accepted. Adjacent `message` chunks fold together verbatim, as do adjacent `thought` chunks, retaining the first chunk's timestamp. Kind changes and prompt boundaries break a fold. Tool, plan, and permission entries remain distinct.

An answer settles only the current unanswered block. An empty string is a valid answer. Settlement assigns the answer and end time together and does not close the session or give an agent a terminal outcome. Duplicate answers and activity after settlement are rejected. Another prompt may then begin.

### Close and delete

First close wins and fixes the outcome and closure time. Core records accept only `Closed`; agent records accept `Completed`, `Failed`, `Terminated`, and the disposal fallback `Closed`. Incompatible outcomes are rejected. Closing preserves unanswered partial activity without inventing an answer.

Deleting a missing or open record returns false. A closed record's durable file is removed before its in-memory row disappears. An absent file counts as successful removal, including when all earlier saves failed. A different removal failure returns false and leaves the row available for retry.

Successful prompt, activity, answer, close, and delete operations return true. Unknown or invalid ids, closed records, and inapplicable operations return false without changes, subject to closed-record deletion. Invalid ids never become filesystem paths.

### Time and projections

Every accepted begin, prompt, activity, answer, and close uses the clock. Mutation times are clamped to at least the record's previous update time, so a backwards clock cannot reorder history. The same mutation time supplies its update, block, entry, or end timestamp. Times are finite nonnegative epoch milliseconds. Start time never changes.

Rows are detached summaries sorted by descending update time, then ascending id for ties. They include identity, source kind, title, model, owner label/name, optional agent run id, start/update/end times, and derived status. They expose no prompt or activity text.

A window returns detached metadata, source provenance, and the newest chronological suffix of blocks, including a running block. Its default size is 20. A supplied count must be a positive safe integer or the read throws `Invalid ACP record window count.`. Counts beyond the total return all blocks. The result includes total block count, zero-based offset, and `hasOlder`, which is true exactly when offset is positive. Missing or invalid ids return no window for a valid count.

Reads do not publish changes or remember requested window sizes. Mutating a returned row, source, block, or entry cannot alter stored state. Ownership of later loaded windows and 20-block paging increments belongs to the downstream topic.

### Durability and loss boundaries

Records are stored separately per project as versioned JSON documents with UUID identities. Schema version 1 retains source metadata, title, start/update times, paired closure time/outcome, and chronological blocks. Completed blocks pair their answer and end time; only the newest block may remain unanswered.

Durability boundaries are begin, prompt metadata, answer, and close. Begin saves an empty header immediately. Starting a prompt saves its title and metadata plus already-completed history, but excludes the new in-flight block. Streaming activity performs no writes. An answer saves the completed block. Ordinary close and disposal also save an unanswered block's current activity.

A crash may therefore lose the running prompt and its activity, while retaining the header, first-prompt title, and completed blocks. Even a session that never completed a prompt can be recovered. Missing storage is empty history and is created lazily on the first write. Replacements are atomic.

### Startup recovery and retention

Construction scans, recovers, and prunes synchronously before reads are served. Leftover open core records become `Closed`; open agent records become `Terminated`. Each is rewritten with closure and update times equal to the greater of one captured startup time and its previous update time. Start time and saved history stay intact. No provider is restarted, and old session or run ids never become live again.

Only closed records whose closure time is strictly more than 30 days before startup expire. Exactly 30 days old, recently closed long-running sessions, and future-dated closures remain. Retention uses closure time, not start time, last activity, or file modification time. There is no periodic expiry timer or retention setting.

Only regular UUID-named JSON files are scanned. Directories, symlinks, temporary files, and unrelated names are ignored. Malformed JSON, unsupported versions, mismatched identities, invalid source/outcome combinations, activity kinds, timestamps, chronology, or settlement pairs are excluded from history and left untouched. Each rejected or unreadable file reports once for that service's storage scan. A root scan failure reports once and yields empty loaded history.

### Storage errors and change events

A failed save preserves the latest accepted state in memory and marks it dirty for retry at the next durability boundary or disposal. Begin still returns its id, and accepted mutations still return true. Recovery or pruning failure on one record does not prevent another record from being processed. Failed pruning leaves the row visible.

Storage errors use an isolated reporter; a throwing reporter cannot escape a handled failure. The default stderr line is `warning: ACP record "<id>" <operation> failed: <reason>`. Operations are `read`, `scan`, `write`, and `delete`; a root scan uses `scan` for the id. Reasons are reduced to their first line with terminal punctuation removed. A rejected record reports `read failed: Invalid or unsupported record`.

The internal connections change signal fires once for each accepted begin, prompt, activity, answer, close, or delete, even when its save fails. Each startup recovery and successful expiry deletion also fires once. Reads, refusals, duplicates, failed deletions, storage reports, and state-free save retries are silent. A throwing subscriber cannot block another subscriber or persistence. Downstream delivery coalescing is not part of this service.

### Disposal

Disposal retries dirty terminal saves and closes every remaining open record as `Closed`, including fallback agent records. It attempts every record even if one save fails, retains history, and is idempotent. Each newly closed record publishes one change; there is no extra batch event. Empty or repeated disposal is silent.

After disposal, reads remain available. Begin throws `ACP session records are disposed.` and other mutations return false. The service owns no live ACP process and is not released when an individual tab closes. Producer teardown precedes final record persistence.
