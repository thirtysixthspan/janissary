# Keep every file link on a folded notification line

**Complexity: 3/10** — the fold itself is one method in `NotificationQueue`, and the renderer already draws one file link per line. The only reach beyond those two spots is the field rename on `LogEntry` and `BufferLine` (singular `openFile` to a list), which touches `notify`, `flattenBuffer`'s message-line copy, and the tests that assert the old field. No new architecture.

When sequential repeats fold into one feed line (`NotificationQueue.append`), the held entry takes the newest notification's entry wholesale, so its `openFile` replaces the previous one. A run of seven auto-approved permission prompts reads `Auto-approved a permission prompt (7 times)` with a single clipboard icon, and the six earlier screen captures are unreachable from the feed even though each was written to disk and recorded in `.janissary/notifications.json`.

## Goal

A folded feed line carries a file link for every repeat it stands for, oldest first, so `12:32pm claude 📋📋📋📋📋📋📋 Auto-approved a permission prompt (7 times)` opens each capture from its own icon. A repeat that had no file contributes no icon. The tab link (`openTab`) still follows the latest repeat, since it names a tab rather than an artifact. Each notification's own record line, toast, and `NotifyOptions` stay single-file: one event still has at most one file.

## Approach

1. **`src/tab/types.ts`**: replace `openFile?: string` on `LogEntry` and `BufferLine` with `openFiles?: string[]` — every file the rendered line opens, one link each, oldest first.
2. **`src/notifications/index.ts`** (`notify`): the entry carries `openFiles: [openFile]` when a file is given. `RecordedNotification.openFile` and `NotifyOptions.openFile` are unchanged.
3. **`src/notifications/queue.ts`** (`append` fold): the held entry's `openFiles` is the previous entry's list followed by the new entry's list, omitted when both are empty.
4. **`src/buffer.ts`** (`formatMessageContent`): copy `openFiles` onto the message line instead of `openFile`.
5. **`web/src/shared/transcript/transcript-line.tsx`**: render one `OpenFileLink` per path in `line.openFiles`, keyed by position.

## Implementation steps

1. Change the two type fields in `src/tab/types.ts`.
2. Update `notify` in `src/notifications/index.ts`.
3. Update the fold in `src/notifications/queue.ts`.
4. Update `formatMessageContent` in `src/buffer.ts`.
5. Update the message-line renderer in `transcript-line.tsx`.
6. Update existing tests that assert the singular field, then add the new tests below.

## Tests

- `src/notifications/queue.test.ts`: a folded run accumulates each repeat's file in order; a repeat without a file adds nothing and keeps earlier files; a fold with no files anywhere leaves `openFiles` absent.
- `src/notifications/index.test.ts`: `notify` threads a given file onto the entry as a one-element `openFiles` list and omits it when none is given (updating the existing cases).
- `src/buffer.test.ts`: `openFiles` is copied onto the message line (info and response) and not onto trailing output lines (updating the existing cases).
- `web/src/shared/transcript/transcript-line.test.tsx`: a message line with several files renders one link per file, and each opens its own path (plus the existing single-link cases moved to `openFiles`).

## Spec

`product/specs/notifications.md`, "Repeated notifications": a folded line carries the time and tab link of the latest repeat and a file link for every repeat that had one, oldest first.

## Out of scope

- Capping how many links one folded line can carry. The queue limit bounds lines, not links, and a fold already implies the user wants every capture.
- Toasts, which render no links, and the notification record, which already writes one line per repeat with its own file.
- The metadata-bar e2e browser highlight, the other open issue.
