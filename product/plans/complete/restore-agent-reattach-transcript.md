# Restore agent output when reattaching a remote session

**Complexity: 5/10** — a bounded replay-history policy change in the remote detached-peer relay, covered at the relay boundary where both agent pipe and harness terminal output are represented.

## Goal

Show a remote agent's retained transcript/output when it is reattached, matching the existing restoration behavior for harnesses.

## Approach

Detached-peer replay currently records terminal output but intentionally excludes output from tracked pipe processes. Agent shells use those pipe processes, so their output is absent from a rebuilding attach even though the session router can already hold and deliver replayed output to the rebuilt agent tab. Record all output frames in the bounded replay history; process exits continue to discard each process's retained output.

## Implementation steps

1. Record every output frame in `DetachedPeer` replay history, including tracked pipe output.
2. Extend the detached-peer relay test to verify an agent pipe's earlier and detached output is replayed during a restoring attach.

## Tests

- `src/remote/serve.test.ts` — verifies restoring attach receives retained output from a pipe process.

## Spec updates

- `product/specs/sessions-tab.md` — state that restored agent tabs show retained transcript/output.

## Docs

- `documentation/user-documentation/advanced-agents/remote-agents.md` — explain that agent reattach restores retained transcript output as well as harness history.

## Out of scope

- Live reconnects, which must not replay history into already-open tabs.
- Increasing replay retention limits or changing truncation behavior.
