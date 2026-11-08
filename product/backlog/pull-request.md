<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Limit the additional retention of reply ids for the lifetime of a shell terminal.

Existing Issue: `createReplyMarkers` adds every received background reply id to `written`, including replies that already matched a dispatch and unrelated monitor replies, and retains those ids until the terminal is reattached. Severity: 3/10

Existing Risk: 3/10 - Long-lived shells retain one extra set entry per reply on top of the existing deduplication set in `useBackgroundReplies`, so high-volume reply streams needlessly grow renderer memory.

Proposal Risk: 1/10 - One shared reply-id tracker removes the duplicate per-reply storage introduced here; the existing tracker remains, but this feature adds no second growing copy.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1962 "remove duplicate shell reply-id retention". In `web/src/plugins/shell/useBackgroundReplies.ts` and `web/src/plugins/shell/useShellReplyWriters.ts`, make one stable reply-id tracker serve both duplicate background-reply suppression and the late-dispatch-receipt check, and remove `ReplyMarkers.written` from `createReplyMarkers`. Keep the shared tracker alive across terminal reattachments while resetting only per-terminal marker entries, so a reply delivered before its receipt still suppresses the late marker and retained replies do not replay into the new terminal. Update `useBackgroundReplies.test.ts` and `useShellReplyWriters.test.ts` to cover an early reply followed by its receipt, duplicate replay after reattachment, and the absence of a second growing set for unrelated `monitor` replies; preserve the existing same-id, refusal, and reset behavior.
