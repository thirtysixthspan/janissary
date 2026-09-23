# Never block opening the notification record path

**Complexity: 3/10** — one flag added to an existing `openSync` call, plus one new test case using
`mkfifo`. No new architecture; the existing symlink-refusal and failure-abandonment machinery
already covers the FIFO case once the open cannot block.

`writeRecord` in `src/notifications/record.ts` (lines 41-52) opens `recordPath` with
`O_WRONLY | O_CREAT | O_NOFOLLOW | (O_APPEND or O_TRUNC)` and only *after* that `openSync` call
validates the descriptor with `fstatSync(descriptor).isFile()`. If a named pipe (FIFO) sits at
`.janissary/notifications.json`, `openSync` for writing blocks until a reader opens the other end
of the pipe — and since the server is single-threaded, the next `appendNotificationRecord` or
`clearNotificationRecord` call hangs the entire process forever. A less-trusted process able to
write into the project's `.janissary` directory (the same threat model the existing symlink
refusal treats as in scope) can freeze every client and command this way.

## Goal

Opening the record path never blocks. A FIFO with no reader fails the open immediately (`ENXIO`)
and is swallowed by the existing `catch { abandoned = true; }` handling in
`appendNotificationRecord`/`clearNotificationRecord`. A FIFO with a reader opens immediately but is
then rejected by the existing `fstatSync(descriptor).isFile()` check, exactly as a symlink target
already is. Regular files behave exactly as before — `O_NONBLOCK` only changes open-time blocking
semantics for a FIFO; it is a no-op for a normal file descriptor.

## Approach

Add `constants.O_NONBLOCK` to the flags passed to `openSync` in `writeRecord`. No other line in
`record.ts` changes — the `isSafeDirectory` check, the `O_NOFOLLOW` symlink refusal, the
post-open `isFile()` check, and the abandonment behavior on a caught error are all unaffected and
already produce the right outcome once the open itself cannot hang.

## Implementation steps

1. `src/notifications/record.ts`: change the `flags` computation in `writeRecord` (line 43-44) to
   include `constants.O_NONBLOCK` alongside the existing flags.
2. `src/notifications/record.test.ts`: add a case that creates a FIFO at the record path with the
   `mkfifo` shell utility (`node:child_process`'s `execFileSync('mkfifo', [path])`, since `node:fs`
   has no `mkfifo`), then calls `appendNotificationRecord` and `clearNotificationRecord` and
   asserts neither throws, neither hangs (the test itself hanging is the failure mode this guards
   against), and the FIFO is left in place (not replaced by a regular file).

## Tests

- `src/notifications/record.test.ts`: new case — a FIFO at the record path does not hang
  `appendNotificationRecord` or `clearNotificationRecord`, both are swallowed the same way a
  symlink write is, and the FIFO itself is left untouched. Existing symlink-refusal,
  failure-abandonment, truncation, and no-project-directory cases keep passing unmodified.

## Out of scope

- The queue, feed, and toast delivery paths — nothing about how or when a notification is shown
  changes.
- The PR description event-inventory entry and the user-documentation entry — separate backlog
  items.
