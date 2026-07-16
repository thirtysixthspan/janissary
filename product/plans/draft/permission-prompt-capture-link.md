# Link an auto-approved permission prompt's screen capture from its notification

**Complexity: 4/10** — a handful of coordinated small edits across the auto-approve flow, the notification path, and the log-entry→buffer→render passthrough (server and web), each individually simple; the clickable link reuses the existing `edit` command and file-link click precedent rather than adding any new RPC.

## Summary

When a workspaced claude harness launched with `-y` auto-approves one of its own permission prompts, the app already records an `auto-approve` notification line ("Auto-approved a permission prompt"). This feature additionally captures the harness's on-screen text at the moment of approval, writes it to a file, and attaches a clickable link to that same notification line — clicking the link opens the captured file in a normal editor tab, so the user can see exactly what was auto-approved after the fact.

The notification itself is unchanged in wording and behavior: it is still the existing `auto-approve` line. The only addition is the clickable link. The trigger is specifically the **successful auto-approval** — not a prompt that is waiting on the user (a tab launched without `-y`), and not the "stood down / could not clear the permission prompt" case, since neither of those is an approval.

## Design decisions

- **Trigger: successful auto-approvals only.** The capture-and-link happens exactly where `HarnessAutoApprover` injects the approval keystroke and records "Auto-approved a permission prompt" — the one place an auto-approval actually occurs. Prompts awaiting the user and the stand-down/"could not clear" path get no capture and no link.
- **The notification stays the same.** The existing `auto-approve` notification text and its always-fire/focus-bypass behavior are untouched; the feature only adds a link affordance to that line.
- **Captures reuse `.janissary/captures/`.** The screen text is written with the existing `writeCaptureFile` into the existing captures directory, sharing its filename scheme (`<label>-<timestamp>.txt`) and lifecycle (cleared at the next normal launch, preserved across a `--relaunch` handoff). No new directory is introduced.
- **File written only when the notification records.** The capture file is written only when a notification will actually be recorded — i.e. when the notifications tab is open. When it is closed (the drop-if-closed rule), nothing is written, so there are no orphan capture files that no notification points at.
- **Once per approved prompt.** `HarnessAutoApprover` already guards against re-approving an identical, uncleared gate (its `lastApprovedText`), so a single approval — and therefore a single capture + link — is produced per distinct approved prompt, not one per screen capture while the gate lingers.
- **Clickable link via a structured entry field, reusing the existing `edit` command.** The link is not free text: the notification's log entry carries the captured file's absolute path in a new optional field, and the transcript renderer shows it as a clickable element. Clicking it reuses the existing pattern in `web/src/transcript-line.tsx:96-99`, where a file link sends `client.send({ method: 'command', params: { text: 'edit <path>' } })`; the `edit <file>` command (`src/open-file-manager.ts:47`) already opens the target in an editor tab via `openInEditor`. **No new RPC, controller method, or message-handler case is added** — the `command` RPC and `edit` command already do exactly this. (`edit` bypasses the opener registry and handles extensionless/plain files, which is correct for a `.txt` capture; the path is absolute, so cwd resolution is irrelevant.)
- **Claude-only, by consequence.** Only claude has auto-approval and gate detection today, so in practice this only fires for claude `-y` tabs — no new per-harness work is added.

## What already exists (reuse, don't rebuild)

| Concern | Existing thing to reuse | Where |
| --- | --- | --- |
| Detecting + approving a permission gate, and firing the `auto-approve` notification | `HarnessAutoApprover.onCapture` (approval branch) | `src/harness/auto-approve.ts:85` |
| The captured screen text + timestamp at approval time | `ScreenCapture { text, capturedAt }` passed to `onCapture` | `src/harness/screen.ts:12` |
| Writing a screen capture to a file under `.janissary/captures/` | `writeCaptureFile` | `src/harness/capture-file.ts:17` |
| Opening a file in an editor tab | `OpenFileManager.edit(command, target, label)` | `src/open-file-manager.ts:47` |
| Recording an `auto-approve` notification line | `notify(managers, 'auto-approve', label, message)` | `src/notifications.ts:72`; wired at `src/harness/manager.ts:164` |
| Whether the notifications feed is open (drop-if-closed) | `notificationsTab(managers)` | `src/notifications-tab.ts:13` |
| Carrying per-entry fields to the client (`from`/`fromColor`) | notification entries set `from`, so they route through `handleMessageEntry` (`src/tab/formatting-handlers.ts:46-50`) → `formatMessageContent` (`src/buffer.ts:23`) → a `type: 'message'` `BufferLine` | `src/types.ts:10`, `src/buffer.ts:23`, `src/types.ts:38` |
| Opening a file in an editor tab by sending a command from the client | the `edit <path>` file-link click | `web/src/transcript-line.tsx:96-99` → `command` RPC (`src/protocol.ts:100`) → `edit` command → `OpenFileManager.edit` |
| Client transcript/notification line rendering — the `type: 'message'` branch that renders `● <from>: <text>` | `renderLine` message branch | `web/src/transcript-line.tsx:164-170` (used by `NotificationsTab`/`Transcript`) |

## Proposed changes

**`src/harness/auto-approve.ts` — approval branch (`:85-88`).** In the branch that injects the keystroke and calls `this.opts.notify('Auto-approved a permission prompt')`, pass the just-approved `ScreenCapture` along so the caller can write it and link it. Do this by widening the approver's `notify` option signature to `(message: string, capture?: ScreenCapture) => void` and passing `capture` **only** on this successful-approval call; the stand-down call (`:81`, `'Auto-approve could not clear…'`) keeps passing just the message. The gate-detection and `lastApprovedText` loop-guard logic is otherwise unchanged, and it already ensures this fires once per distinct uncleared gate.

**`src/harness/manager.ts` — `buildAutoApprover` notify wiring (`:164`).** Replace the current `notify: (message) => notify(this.managers, 'auto-approve', label, message)` with `notify: (message, capture) => …` that, when a `capture` is supplied AND `notificationsTab(this.managers)` is open, writes the capture via `writeCaptureFile(label, capture.capturedAt, capture.text)` and calls `notify(this.managers, 'auto-approve', label, message, <absolute path>)`; when there is no capture (the stand-down message) it calls `notify` exactly as today with no path. Checking `notificationsTab` here keeps the file write gated on "will actually notify" — `notify` itself also no-ops when the tab is closed, so the file is never written for a dropped notification. Import `notificationsTab` from `src/notifications-tab.ts:13`.

**`src/notifications.ts` — `notify` (`:72`).** Add an optional `openFile` argument that, when present, is set on the `LogEntry` handed to `appendNotification` (`:81`). No change to `shouldNotify`, focus rules, or the existing message text.

**`src/types.ts` — `LogEntry` (`:10`) and `BufferLine` (`:38`).** Add an optional `openFile?: string` (absolute path of a file to open in an editor tab on click) to both.

**`src/buffer.ts` — `formatMessageContent` (`:23`).** Carry `entry.openFile` onto the primary emitted `type: 'message'` line (the push at `:28`/`:33`), alongside the existing `from`/`fromColor` passthrough, so it reaches the client. The additional `type: 'output'` lines it emits do not need it.

**`web/src/transcript-line.tsx` — the `type === 'message'` branch (`:164-170`).** When the line carries `openFile`, render a small clickable link/element after the `● <from>: <text>` content whose `onClick` sends `client.send({ method: 'command', params: { text: `edit ${line.openFile}` } })` — the exact call `renderMarkdownLine` already makes at `:98`. `client` is already a parameter of `renderLine`, so no new plumbing is needed. Lines without `openFile` render exactly as today. Keep the file within the 200-line limit — extract a tiny helper if the addition would push it over. (No protocol, controller, or `message-handler.ts` change is required.)

## Tests

- **`src/harness/auto-approve.test.ts`** — the successful-approval path passes the approved `ScreenCapture` to the notify callback; the stand-down/"could not clear" path calls notify with no capture; a re-detected identical gate still only approves (and therefore captures) once.
- **`src/harness/manager.test.ts`** (auto-approve wiring) — with the notifications tab open, an auto-approval writes a capture file and records a notification whose entry carries the file's `openFile` path; with the notifications tab closed, no file is written and no notification is recorded.
- **`src/notifications.test.ts`** (or the notifications-tab test) — `notify` threads an `openFile` argument onto the appended entry, and omits it when not given.
- **`src/buffer.test.ts`** — `formatMessageContent` copies `openFile` onto the emitted `type: 'message'` line.
- **`web/src/transcript-line.test.tsx`** (or `NotificationsTab.test.tsx`) — a `type: 'message'` line with `openFile` renders a clickable link whose click sends a `command` RPC with `text: 'edit <path>'`; a line without `openFile` renders unchanged.
- Follow the colocated `*.test.ts(x)` convention (vitest `server`/`client` projects).

## Out of scope

- Capturing prompts that are **not** auto-approved — a prompt awaiting the user (tab launched without `-y`) produces no capture or link here (it is already badged unread by busy-status).
- The stand-down / "could not clear the permission prompt" case — that notification stays plain, with no capture link.
- opencode and codex — they have no auto-approval or gate detection yet, so nothing fires for them; adding their gate signatures is separate, existing future work.
- Changing the `auto-approve` notification's wording, dot, timing, or toggle behavior.
- Writing capture files while the notifications tab is closed, or any backlog of missed captures.
- A new dedicated permission-prompts directory — the reused `.janissary/captures/` directory is intentional.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks the affected projects, and runs the affected server and web tests.
- Manual: launch `harness claude -w -y`, open the notifications tab, and drive claude to a permission prompt. Confirm the prompt is auto-approved, that the "Auto-approved a permission prompt" notification line now shows a clickable link, that clicking it opens the captured screen text in an editor tab, and that the corresponding file exists under `.janissary/captures/`. Confirm that with the notifications tab closed no capture file is written, and that a `harness claude -w` (no `-y`) prompt produces no capture link.
