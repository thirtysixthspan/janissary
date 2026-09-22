# Share one remote-serve command builder between launch and capture

Complexity 3/10 - a small internal refactor inside one file, with the regression net already in
place as two exact-string test assertions that must not need to change.

`remoteCaptureCommand` in `src/remote/entry-factory.ts` reconstructs the same `janus
remote-serve` invocation `remoteServeCommand` builds directly above it — the same optional path
interpolation, the same `$SHELL -ic` wrapping, the same quoting — differing only by three
prepended `ssh -o` flags. A fix to the quoting or the shell invocation could land in one copy
and not the other.

## Goal

One internal helper builds the `janus remote-serve …` invocation and its `$SHELL -ic` wrapping;
`remoteServeCommand` and `remoteCaptureCommand` both call it, differing only in which `ssh -o`
flags they pass. Both exported names and their exact output strings are unchanged —
`src/remote/manager.test.ts`'s `remoteServeCommand` and `remoteCaptureCommand` describe blocks
pin this and must keep passing with their expected strings untouched.

## Approach

In `src/remote/entry-factory.ts`, add a private `sshRemoteCommand(address: RemoteAddress,
options: string[] = []): string` that builds `janus remote-serve${address.path ? \` \${address.path}\`
: ''}`, wraps it in `'$SHELL -ic "…"'` exactly as today, and prepends `options.join(' ')` plus a
trailing space ahead of `-t ${address.destination}` when `options` is non-empty (empty by
default, so `remoteServeCommand`'s output is unchanged byte-for-byte). Re-express
`remoteServeCommand` as `sshRemoteCommand(address)` and `remoteCaptureCommand` as
`sshRemoteCommand(address, ['-o BatchMode=yes', '-o NumberOfPasswordPrompts=0', '-o
ConnectTimeout=10'])`. Both exported function names and signatures stay exactly as they are —
`remoteServeCommand` is re-exported through `src/remote/manager.ts`, and `remoteCaptureCommand`
is what `queryParkedCapture` in `src/harness/capture-remote.ts` imports.

## Implementation steps

1. Add `sshRemoteCommand` to `entry-factory.ts`.
2. Re-express both exported functions in terms of it.
3. Run `check-diff`.

## Tests

No new tests — this changes no observable output. The existing `remoteServeCommand` and
`remoteCaptureCommand` describe blocks in `src/remote/manager.test.ts` are the regression net:
every one of their exact-string assertions must keep passing unchanged, proving the refactor
altered no command line.

## Out of scope

- Any change to the exported function names, their signatures, or `remoteCaptureCommand`'s
  three `ssh -o` flags.
- `src/harness/capture-remote.ts` or `src/remote/manager.ts` — both already import the names
  this refactor preserves.
