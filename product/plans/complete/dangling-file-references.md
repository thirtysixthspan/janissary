# Correct the comments that name files the agent-tab removal deleted or renamed

**Complexity: 1/10** — three comment blocks, no code, no tests, no behavior. The only judgment is
whether each comment's *claim* survives the deletion, not just its filename, which is why the
diagnosis below reads longer than the change.

## Summary

`feat(tabs)!: remove agent tabs` deleted or renamed a number of source files. Three comments in live
code still name them, and two of the three now also assert something untrue.

| Location | Names | State on the branch |
| --- | --- | --- |
| `src/controller/recording.ts:6` | `web/src/shared/AgentTabMeta.tsx` | renamed to `HarnessTabMeta.tsx` |
| `src/controller/transcript.ts:7` | `AgentTabMeta.tsx` | renamed to `HarnessTabMeta.tsx` |
| `src/shell/command-input.ts:3` | `restored-transcript.ts` | deleted outright |

The first two are pure filename rot: the referenced component still exists under its new name, and both
comments remain accurate once the name is corrected. `HarnessTabMeta.tsx` still renders both controls
they describe — the transcript button at `web/src/shared/HarnessTabMeta.tsx:17` (`onOpenTranscript`) and
the recording flag at `:64` — and the shell plugin's own row still renders its `RecordingFlag`
(`web/src/plugins/shell/ShellTabMeta.tsx:47`), so `recording.ts`'s "and the shell plugin's own row"
clause stands as written.

The third is different in kind. Its comment claims `restored-transcript.ts` "recovers each command from
exactly this wrapper — so writer and reader share one definition rather than two that can drift." That
file is gone, and nothing in the tree parses `COMMAND_INPUT_PREFIX`/`COMMAND_INPUT_SUFFIX` back out
again, so the comment points a reader at a file that is not there and justifies the module's existence
with a reader that does not exist.

## Goal

Every comment in live code names a file that exists, and no comment claims a reader that the agent-tab
removal took with it.

## Approach

1. **`src/controller/recording.ts`** and **`src/controller/transcript.ts`**: correct the filename to
   `HarnessTabMeta`. Nothing else in either block changes — both descriptions are still true.

2. **`src/shell/command-input.ts`**: replace the deleted-file reference with the reader that is actually
   there. Two claims need replacing, not one:
   - The header's "read back as well as written … `restored-transcript.ts` recovers each command" becomes
     the live reader, `executeShellCmd` (`src/shell/index.ts:69`), which matches the delimiter against
     what comes back. That is what "read back as well as written" now means, and it still justifies the
     module: the wrapper and the matcher that reads it share one definition.
   - The pwd comment's "The reader recognizes it and leaves it out of a restored transcript entirely"
     becomes `queryShellPwd` (`src/shell/index.ts:121`), which reads that answer off its own
     `__PWD_` marker rather than the command wrapper's.

The `replay` half of the header claim is left alone: `src/remote/replay-history.ts:69` does retain these
exact bytes and `terminalFrames` (`:87`) does replay them when a session is attached, so that sentence is
still true and is not part of this fix.

## Implementation steps

1. `src/controller/recording.ts:6` — `AgentTabMeta.tsx` → `HarnessTabMeta.tsx`.
2. `src/controller/transcript.ts:7` — `AgentTabMeta.tsx` → `HarnessTabMeta.tsx`.
3. `src/shell/command-input.ts:1-4` and `:9-10` — rewrite the two blocks as above.
4. `./scripts/run.mjs check-diff`.

## Tests

No new tests and no test changes. This edits comments only; no identifier, signature, or string literal
in an executable position changes. `src/shell/index.test.ts` exercises `shellCommandInput` and
`shellPwdQueryInput` and is the suite that would catch a mistake here.

## Out of scope

- Whether `SessionListener.onHistory` (`src/remote/channel/sessions.ts:18`) having no production
  assignment is a lost feature. It is declared and dispatched but nothing sets it, which is a real
  question about the replay path — but it is a behavioral question, and this change is comment-only.
- Historical `AgentTabMeta` and `restored-transcript` mentions in `CHANGELOG.md` and
  `product/plans/complete/*.md`, which record what was true when written.
- The remaining entry in `product/backlog/pull-request.md` (documentation for startup, remote shell
  restoration, and conversation shell launches), which this change does not address.