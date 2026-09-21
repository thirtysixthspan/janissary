# Restored agent shell history keeps its commands

Issue: when attaching to a detached agent, the full buffer including commands and responses should be available for review. Currently only the responses are available.

Complexity rating: 6/10

## Goal

Attaching a parked session rebuilds each surviving agent tab and fills its transcript from the peer's retained history. That history is one-sided. A remote agent tab's shell runs in `pipe` mode precisely so no tty echo can corrupt the sentinel protocol, which means the far side only ever *emits* the shell's output — the commands that produced it were written in as `input` frames and were never echoed back. `ReplayHistory` records emitted frames only, so an attached agent tab's transcript comes back as a single entry with an empty `input` and every command's output run together in one blob: the responses without the questions.

After this change a peer retains the command text it was sent as well as the output it produced, and an attached agent tab's transcript is rebuilt as the sequence of `{ input, output }` entries the live tab had — each command beside the output it produced, in order — so the whole buffer can be reviewed rather than half of it.

## Approach

The far side already knows everything needed: it sees each `input` frame and the output that follows it, and it already tracks which spawn ids are `pipe` ids (`DetachedPeer.track`). What is missing is retention of the input and a way to replay it distinguishably.

Three decisions shape the design.

**Input is retained only for `pipe` ids.** A `pty` process's tty echoes what is written to it, so its input is already in the retained output; recording it again would double every keystroke in a redrawn terminal.

**The replay of a piped shell's history is its own frame, not more `output`.** Folding the recorded input into the `output` stream would put the sentinel `echo "__JS_END_…__"` text into the bytes a live `executeShellCmd` scans, matching the delimiter before the command had run — the exact failure the pipe mode exists to avoid. A distinct `shell-history` frame carrying ordered `{ source, text }` runs keeps that text out of the output path entirely, and it arrives as one frame per process rather than a burst, so the local side can segment the whole history in a single pure call with no end-of-replay signal to wait for.

**Nothing changes for an automatic reconnect.** A lost transport replays into tabs that are already open and mid-command; only an attach that *rebuilds* tabs needs the commands. `ReplayHistory.frames` already takes the `restore` flag that distinguishes them, so retained input is replayed under `restore` alone and the recovery path stays byte-for-byte what it is today.

Segmentation itself is a pure function over the runs. The wire format of what is written to a piped shell is defined by `shellCommandInput` and `queryShellPwd` in `src/shell/index.ts`, so the constants those two build from are exported and the parser consumes the same ones — the pair cannot drift. A command run opens a new entry with that command as its `input`; a `pwd` query run is skipped, since the debris it leaves in the output is what `stripShellSentinels` already removes; output runs accumulate into the open entry. Each finished entry's output goes through `stripShellSentinels` exactly as it does today, so restored history still reads the way live output does.

The contract moves to version 17. It is the archetype the version comment already names: a version-16 peer retains no input, so it looks healthy while answering an attach with command-less history.

## Implementation steps

1. **`src/remote/protocol.ts`** — add the `ShellHistoryRun` type (`{ source: 'input' | 'output'; text: string }`) and the `shell-history` server frame (`{ type: 'shell-history'; id: string; runs: ShellHistoryRun[] }`); register it in `SERVER_FRAME_TYPES`; base64 each run's `text` in `toWire` beside the existing `output`/`transcript` cases; bump `REMOTE_PROTOCOL_VERSION` to 17 with its version paragraph.
2. **`src/remote/frame-decode-history.ts`** (new) — `decodeShellHistory`: the id must be a nonempty string, `runs` an array whose every entry has a known `source` and a string `text`; one malformed run refuses the whole frame, as `frame-decode-sessions.ts` does. A new module rather than more of `frame-decode.ts`, which is at the size limit.
3. **`src/remote/frame-decode.ts`** — dispatch `shell-history` to it.
4. **`src/remote/replay-history.ts`** — entries carry an optional `input` marker; `recordInput(id, data)` appends one. `frames(restore)` groups entries by id as it does now, merges consecutive same-kind entries into runs, and per id emits either one `shell-history` frame (when `restore` and that id has retained input) or the merged `output` frame it emits today. The trimmed notice stays the first output run's prefix so a truncated agent replay still carries it.
5. **`src/remote/serve-detach.ts`** — `DetachedPeer.input(frame)` records an `input` frame into the history when its id is a tracked pipe id, and ignores it otherwise.
6. **`src/remote/serve.ts`** — the `input` case tells the peer before handing the data to the process, so the recorded order is the order the far side saw.
7. **`src/remote/channel-pending.ts`** — widen the held-frame union to include `shell-history`, so a frame arriving for a tab still being built is held rather than dropped.
8. **`src/remote/channel-sessions.ts`** — `SessionListener` gains an optional `onHistory`; `SessionRouter.history(frame)` routes it like `output` (listener, else hold while an attach is settling); the claim loop in `attach` delivers held history frames in arrival order.
9. **`src/remote/channel.ts`** — dispatch `shell-history` to the router.
10. **`src/remote/shell-session.ts`** — replace the `onRestoredOutput` parameter with a `RestoredSink` (`{ output, history }`); output with no live listener goes to `output` as before, and `onHistory` goes to `history` unconditionally — a history frame must never reach `stdout`.
11. **`src/shell/index.ts`** — export `COMMAND_INPUT_PREFIX`, `COMMAND_INPUT_SUFFIX`, and `PWD_QUERY_PREFIX`, and build `shellCommandInput`/`queryShellPwd`'s writes from them.
12. **`src/shell/restored-transcript.ts`** (new, pure) — `restoredTranscript(runs)` → `LogEntry[]`: recognize a command run and open an entry with its command, skip a `pwd` query run, accumulate output runs, strip sentinels per entry, and drop entries left empty.
13. **`src/shell/manager.ts`** — pass the restored sink; `appendRestoredHistory(label, runs)` appends each reconstructed entry through `managers.tab.append`. `appendRestoredOutput` stays for the output-only path (a peer that retained no input, and the leading output of one that did).

## Tests

- `src/shell/restored-transcript.test.ts` (new): a single command and its output; two commands in sequence; a `pwd` query between them left out of the transcript along with its debris; output arriving before any recorded command kept as a leading entry with no input; sentinel lines stripped from every entry; an empty run list and an all-empty entry yielding nothing.
- `src/remote/replay-history.test.ts`: retained input replayed as a `shell-history` frame with its runs in order under `restore`; the same history replayed as today's merged `output` frame when not restoring; a pty id's frame unchanged by the presence of a piped id's input; the trimmed notice present on a truncated agent replay.
- `src/remote/protocol.test.ts`: the version is 17; a `shell-history` frame encodes and decodes with its runs intact; a run with an unknown `source` or a non-string `text` is refused.
- `src/remote/serve.test.ts`: a `DetachedPeer` given a tracked pipe spawn, an `input` frame, and its output replays both through the relay in order for a restoring attach; an `input` frame for a pty id is not retained separately.
- `src/sessions/agent-roundtrip.test.ts`: a detached agent whose shell was sent a command comes back with a transcript entry carrying that command and its output, across the existing repeated detach/attach cycles.

## Out of scope

- The ACP conversation of a remote agent tab. Prompts and reply chunks are not retained by a peer at all, so an attached tab's ACP history is a separate gap with its own retention question; this change is about the shell buffer the issue names.
- Harness tabs, whose retained history is a terminal redraw and already carries what was typed, because a pty echoes it.
- The retention budget and the truncation reporting, which are unchanged: retained input shares the existing terminal budget and the existing truncated-replay line.
- Restoring a remote file navigator, still deliberately not restored.
- Persisting restored transcripts any differently from live ones.

## Specs and docs

- `product/specs/remote-server.md`: a protocol-17 paragraph for retained shell input; the attached-agent paragraph updated to say the restored transcript reads as commands beside their output.
- `product/specs/sessions-tab.md`: the restored-history sentence updated the same way.
- `documentation/user-documentation/advanced-agents/remote-agents.md`: the attach paragraph's "retained shell output" updated to name the commands as well.
- `help.md`: does not describe restored history; no update.
