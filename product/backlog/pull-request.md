<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's bounded terminate-reply handling for complete first lines.

Existing Issue: `terminatePeer` checks `ANSWER_BUDGET_BYTES` only when no newline has arrived, so an over-1024-byte complete first line is decoded, forwarded, and can trigger shutdown; after `setEncoding('utf8')`, `buffer.length` also counts UTF-16 code units rather than bytes. Severity: 6/10

Existing Risk: 5/10 - A peer can bypass the promised reply cap with a large accepted `attach-result`, causing unbounded parsing and stdout forwarding during termination, and a line the plan says to drop can still trigger shutdown.

Proposal Risk: 2/10 - Enforcing the byte limit before decoding or forwarding bounds the peer reply while preserving normal accepted and refused termination behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1983 "enforce the terminate reply byte limit for complete lines". In `src/remote/serve-detach-terminate.ts`, enforce the 1024-byte limit on the exact first-line bytes before `isAccepted`, whether the newline arrives in the same data event or a later one; retain bytes until the newline or count the UTF-8 byte length of the first-line slice, and destroy the socket without output when it exceeds the limit. Keep the existing one-line-only behavior and accepted/refused handling. Extend `src/remote/serve.test.ts` with an oversized complete accepted `attach-result` containing an ignored extra field and a multi-byte partial response whose encoded size exceeds 1024 bytes, asserting neither response reaches `output`, no shutdown reaches the peer, and the relay ends with `ended(false)`. Preserve the short accepted-reply case that forwards only the first line and sends shutdown, plus the refused-reply case that forwards without shutdown.
