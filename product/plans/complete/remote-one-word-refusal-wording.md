# Align remote one-word refusals with the local wording

**Complexity: 4/10** — ~14 added lines across 5 production files, 5 requirements, 7 test scenarios (p=5.00).

## Goal

A remote tab's `file list`, `file stat`, and `file exists` answer `forbidden` for an absolute path or a path that climbs out of the workspace, exactly as a local tab does, without echoing the path. `file head` and `file tail` keep the file reader's verbose error lines.

## Approach

The near-side helpers in `src/file-navigator/remote/port-reads.ts` short-circuit absolute paths to an echoed `Outside the workspace: <path>.` line for all five typed read operations. Only the three one-word commands should change to the canonical `forbidden` from `src/file-failure.ts`; the two line-reading commands deliberately keep the verbose wording. A far-side containment refusal reaches the client as an error carrying `OUTSIDE_ROOT_REASON`, which `rejectionLine` in `src/file-read/tab-read.ts` turns into the same echoed line. Add a companion helper for the one-word commands and use it in their three tab executors, leaving `rejectionLine` and head/tail untouched.

## Implementation steps

1. In `src/file-navigator/remote/port-reads.ts`, make `remoteListDirectory`, `remoteStatPath`, and `remotePathExists` return `fileFailureLine('Outside the workspace', relPath) ?? 'forbidden'` for an absolute path, leaving the other three helpers as they are.
2. In `src/file-read/tab-read.ts`, add `oneWordRejectionLine`, which maps `OUTSIDE_ROOT_REASON` to that same `forbidden` and otherwise delegates to `rejectionLine`. Switch the `file-exists`, `file-list`, and `file-stat` executors to it; do not change `file-head-tail`.

## Tests

- Update the remote-tab assertions in `src/file-exists/tab-exists.test.ts`, `src/file-list/tab-list.test.ts`, and `src/file-stat/tab-stat.test.ts` that currently expect the echoed line to expect `forbidden`.
- In each, compare the local and remote answers for an absolute path and for a `../` path, and drive the `../` case through a real `RemoteFileNavigators` loopback so the actual far-side containment refusal is exercised.
- Update the absolute-path assertion in `src/file-navigator/remote/port.test.ts` for `listDirectory`, `statPath`, and `pathExists`; keep the head/tail verbose assertion.
- Run `$janissary/scripts/run.mjs check-diff` after each change.

## Spec

`product/specs/remote-server.md` already claims the two surfaces answer identically; keep that claim true and state explicitly that the three one-word commands refuse an absolute or escaping path with `forbidden` while head and tail keep the verbose lines.

## Out of scope

- Changing `rejectionLine` or head/tail behavior.
- Changing the far-side refusal protocol, the local one-word commands, or the remote protocol version.
- Correcting unrelated paragraphs of the pull-request description or the other backlog entry.
