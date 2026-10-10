# Launcher summarizes harness transcripts

**Complexity: 3/10** — the host already maintains normalized harness transcript entries, so the fix is to include that source in its existing bounded activity projection and cover the read.

## Goal

Let launcher summaries use the normalized transcript produced by an open harness tab.

## Approach

Extend `tabActivityRows` to read a harness tab's transcript tailer when transcript content is requested. Combine its newest entries with any tab log entries under the existing character cap, and include the tailer's entry count in the reported transcript length so the launcher notices new harness output. Keep ordinary display reads free of transcript content.

## Implementation steps

1. Update `src/plugins/activity.ts` to include the harness transcript tail in opt-in activity reads while preserving the existing tail limits and no-tail display behavior.
2. Add activity tests for harness transcript inclusion, bounding, and change detection through `logLength`.
3. Update `product/specs/launcher.md` to state that harness summaries use their normalized session transcript.

## Tests

- `src/plugins/activity.test.ts`: verify requested tails include the newest normalized harness transcript entries, obey the character cap, and increase `logLength` as harness entries arrive.
- Existing launcher summarizer tests continue to cover that changed transcript length triggers a flush.

## Out of scope

- Changing harness transcript normalization, persistence, or tailer lifecycle.
- Summarizing editor contents or changing which tab kinds receive summaries.
- Updating user documentation; the existing user pages do not describe launcher summaries.
