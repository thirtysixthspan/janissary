# Auto-approve permission requests in workspaced harnesses

**Complexity: 3/10** — one new small module (a pure gate detector + a stateful approver with a two-field loop guard), a `-y`/`--yes` flag on the `harness` command (claude-only), an `onCapture` callback on the existing screen reader, and one new notification event type; a single wiring site in `spawnTab`. No new view type, no protocol/RPC change, no persistence (harness tabs are in-memory), and no image processing — detection runs on the *text* the screen reader already produces, against gate fixtures already captured (see Ground truth), so there is a single detector and a single approval keystroke to get right.

## Summary

Today a workspaced harness (`harness claude -w`) runs confined to a disposable clone under a Seatbelt sandbox (see [[isolate-workspaced-agents-seatbelt]] / `specs/workspaced-agent.md`), but it still stops and waits whenever its own CLI raises a permission prompt ("Do you want to proceed? ❯ 1. Yes …"). Because the process is already sandboxed to a throwaway workspace, those approvals are low-risk busywork — the whole point of the workspace is that the harness can't touch anything outside it. This feature lets a workspaced harness run unattended by having Janissary itself watch the harness's rendered screen, recognize a blocking permission gate, and inject the approval keystroke automatically, then drop a line into the notifications feed so the user knows it happened.

The mechanism reuses the existing screen-capture pipeline wholesale. `HarnessScreenReader` (`src/harness-screen.ts`) already mirrors each harness PTY into a headless terminal and, ~1s after each output burst settles, produces a coherent de-ANSI'd text snapshot of the visible screen (`{ text, capturedAt }`). A permission gate is exactly such a settled state — the harness prints the prompt and goes quiet waiting for input, which triggers a capture. This plan adds a new `HarnessAutoApprover` that receives each fresh capture, runs a per-harness `detectPermissionGate(text, harnessName)` heuristic against it, and on a positive match writes the approval keystroke straight to the PTY via `PseudoterminalManager.input(ptyId, …)` and fires an `auto-approve` notification naming the tab.

Auto-approval is opt-in per launch via a new `-y` (`--yes`) flag on the `harness` command, and — matching the feature's "in workspaced environments" framing — is **only honored together with `-w`/`--workspace`**. Auto-approving arbitrary permission prompts is only defensible because the workspace + Seatbelt sandbox contains the blast radius; enabling it for an unsandboxed harness running in the user's real working tree would be actively dangerous, so `-y` without `-w` is a usage error rather than a silent no-op.

**Scope: claude only.** This plan implements auto-approval for the **claude** harness exclusively, because claude is the only harness whose gate structure has been captured and verified (five variants — see Ground truth). `-y` on `opencode` or `codex` is a usage error, not a silent no-op — extending to them is deliberate later work (each needs its own captured gate signatures and approval keystroke), and the design keeps that door open (a per-harness detector table) without doing it now.

## Design decisions

0. **Scope: the claude harness only.** `-y` is honored only for `harness claude`; on `opencode`/`codex` it is a usage error (see Decision 2's sibling check in §4). Rationale: claude's gate structure is captured and settled (Ground truth), the others are not — auto-approving an unverified gate structure risks either missing the gate (harmless but useless) or, worse, matching the wrong screen. The detector is written table-per-harness so adding opencode/codex later is purely additive (capture → add a table entry + keystroke), but this plan ships claude alone.

1. **Detection is a text heuristic, not image analysis and not an LLM.** The feature calls the input "screenshots", but the artifact that actually exists is the screen reader's rendered *text* capture (`harness-screen.ts:62-70`, `captureNow`), not a bitmap — there is no image to analyze, and adding OCR/vision would be wasteful when the exact prompt text is right there. An LLM classifier (reusing the monitor/ACP infra of `monitor-manager.ts`) was also considered and rejected for the core loop: claude's permission gate is a fixed, structurally-stable UI (the `❯ 1. Yes` … final `No`-option menu), so a deterministic anchor match is instant, free, and far more reliable than a ~seconds-latency, cost-incurring, occasionally-wrong model call — and auto-approval is a security-sensitive action where false positives must be near-zero. Detection lives in a new `src/harness-auto-approve.ts` module in the style of `src/recognizers/*.ts` (a pure matcher, independently unit-tested against the captured fixtures). An optional LLM confirmation pass is noted in Out of scope as a possible fast-follow.

2. **`-y`/`--yes` is only honored with `-w`/`--workspace`; `-y` alone is a hard error, not a silent downgrade.** This encodes the feature title ("in workspaced environments") and the safety rationale above. Error text: `-y/--yes requires -w/--workspace: auto-approval is only allowed in a sandboxed workspace.` A silent downgrade to "launch without auto-approve" was rejected: the user armed unattended approval and walked away — silently not arming it defeats the point without telling them.

3. **When workspaced but the sandbox is not actually active, auto-approve still runs.** `-w` does not guarantee Seatbelt confinement — the `sandboxWorkspaces` config toggle can be off, or `sandbox-exec` may be unavailable (non-darwin), in which case `sandboxNotice()` (`sandbox.ts:49-53`) already appends a "workspace isolation off" line to the tab. In that state the harness is still confined to a *separate git clone* (writes land in the throwaway workspace dir), just not OS-sandboxed. The tab already shows the existing isolation-off notice, so the reduced protection is already communicated; the stricter alternative (refuse to arm unless `sandboxNotice()` returns `undefined`) was rejected as it would make `-y` silently machine-dependent.

4. **Approval keystroke for claude is `"\r"`; `y` alone does NOT work.** The feature says "an approval string 'y'", but every captured claude gate (see "Ground truth" below) is a **numbered selection menu**, not a `y/n` prompt — usually `❯ 1. Yes / 2. Yes, and always allow… / 3. No`, sometimes just `❯ 1. Yes / 2. No` (the two-option subagent capture), always with option 1 highlighted. Sending the literal `y` would not approve it. **The keystroke is `"\r"`** — Enter accepts the highlighted `❯ 1. Yes`, and (per the five captures) this one keystroke works across every claude gate variant regardless of question/footer/option wording or option count. It is preferred over `"1\r"` so it keeps working if option ordering ever changes, as long as the default stays "Yes". (The keystroke is stored per-harness in the detector table so opencode/codex can add their own later, but only claude's is populated now.)

5. **Loop guard: never re-inject into an unchanged gate screen.** The approver records the text of the last screen it approved; if a later capture is *still* a gate with the *identical* text, the previous keystroke did not clear it (wrong keystroke, or the gate genuinely persists), so it does **not** re-send — preventing an infinite Enter-spam loop. It instead fires a single "could not clear" notice and stands down for that gate until the screen changes. Two nuances the implementer must know: (a) the screen reader never re-captures an unchanged, quiet screen (`harness-screen.ts:18-21`), so if an uncleared gate simply sits there with no redraw, no second capture arrives — the guard holds by construction and the "could not clear" notice may never fire; the notice is best-effort, firing only when the gate *redraws* identically. (b) Accepted trade-off: if two *genuinely distinct* gates with byte-identical screen text arrive back-to-back with no intervening non-gate capture, the second is suppressed — rare enough (identical command requested twice with no screen change between) to accept for v1.

6. **Auto-approval state is per-PTY and in-memory only, with no persistence.** Like `HarnessScreenReader`/`HarnessRecorder`, the `HarnessAutoApprover` lives in a `Map<ptyId, …>` on `HarnessManager` and is disposed on the PTY's `exit` bus event. Harness tabs are never persisted or restored on `--relaunch` (`specs/harness.md` § Persistence), so auto-approve is likewise fresh each launch and needs no `AgentState`/`Tab` field.

7. **`profile launch` support is out of scope for v1.** The feature specifies the interactive `harness -y` command only. `ProfileHarnessEntry` could later gain an `autoApprove?: boolean` (threaded through `openFromProfile` → `spawnTab` exactly like `model`), but that is an explicit fast-follow, not part of this plan.

8. **Notification line format: the approver's message never names the tab.** `notify()` (`notifications.ts:60-67`) already prefixes every line with the tab's colored dot and `notificationText` receives `tabLabel`; the `auto-approve` case mirrors the `manual` case's `` `${tabLabel}: ${detail}` `` shape. If the approver's message also said "in '<tab>'", the label would render twice. So the approver supplies label-free messages — `Auto-approved a permission prompt` and `Auto-approve could not clear the permission prompt; standing down` — and the feed renders e.g. `claude: Auto-approved a permission prompt`. This also removes any need for the approver to know its tab label at all.

## Ground truth: captured permission gates

Five claude gate variants were captured live (Bash in-project, Bash out-of-project, Bash two-option from a subagent, Fetch, MCP tool). The important lesson across them: **the question line, the footer, the option wording, and even the option *count* all vary — the two-option subagent capture has no `3.` line at all — but every variant opens with the highlighted `❯ 1. Yes` and closes its menu with a `No` option (numbered `2.` or `3.`), and `\r` approves every variant.** So detection should key on that menu *structure*, not the question, footer, or a fixed option number, and the keystroke is a single `"\r"` regardless of variant.

### claude — Bash gate, in-project (captured)

```
 Bash command

   touch /Users/ashmorgan/dev/janissary/gate-probe.txt
   Create a probe file to test the permission gate

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to janissary/ from this project
   3. No

 Esc to cancel · Tab to amend · ctrl+e to explain
```

### claude — Bash gate, out-of-project (captured)

Identical structure; only option 2's path differs (`ashmorgan/` vs `janissary/`) — confirming option-2 wording is variable and must not be part of the pattern:

```
 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to ashmorgan/ from this project
   3. No

 Esc to cancel · Tab to amend · ctrl+e to explain
```

### claude — Fetch gate (captured)

Different **question line**, different option-2/3 wording, and **no `Esc to cancel · …` footer** (the `(esc)` hint is folded into option 3 instead):

```
 Fetch

   url: "https://example.com", prompt: "What is the title of this page?"
   Claude wants to fetch content from example.com

 Do you want to allow Claude to fetch this content?
 ❯ 1. Yes
   2. Yes, and don't ask again for example.com
   3. No, and tell Claude what to do differently (esc)
```

### claude — Bash gate, two-option, raised by a subagent (captured)

The structural outlier among the captures: only **two options** — there is **no `2. Yes, and always allow…` and no `3.` line at all**; "No" is option **2**. Also new here: the header carries a `· from the <agent> agent` suffix when a subagent raises the gate, and an extra warning line (`Contains simple_expansion`) can appear between the command and the question. This capture is why the detector must **not** require a `3. No` line (see Detection strategy):

```
 Bash command · from the general-purpose agent

   for f in security link-scout summarizer algorithm; do echo "== $f =="; sed -n '1,4p' "/Users/ashmorgan/dev/janissary/.janissary/workspace/claude/ai/personas/$f.md"; done
   Run shell command

 Contains simple_expansion

 Do you want to proceed?
 ❯ 1. Yes
   2. No

 Esc to cancel · Tab to amend · ctrl+e to explain
```

### claude — MCP tool gate (captured)

Question line is `Do you want to proceed?` again (so Bash **and** MCP share it; Fetch is the outlier), but the footer is **shorter** (`Esc to cancel · Tab to amend` — no `· ctrl+e to explain`), and option 2 rendered as `2.Yes` **with no space after the period** — a concrete reminder that option-2 text is unreliable to match on:

```
 Tool use

   claude.ai Google Calendar - Returns the calendars on the user's calendar list. (MCP)
   Returns the calendars this user has access to (their calendar list)…

 Do you want to proceed?
 ❯ 1. Yes
   2.Yes, and don't ask again for claude.ai Google Calendar - … commands in /Users/ashmorgan/dev/janissary
   3. No

 Esc to cancel · Tab to amend
```

### Detection strategy (revised from the five captures)

- **Primary anchor — the menu structure, not the question or footer:** require the highlighted-default line `❯ 1. Yes` **and** a later option line whose text begins with `2. No` **or** `3. No`. This pairing is present in all five variants and is independent of the question, footer, option wording, and option count, so it survives every difference observed (Bash/MCP say `Do you want to proceed?` but Fetch does not; Bash has a `· ctrl+e to explain` footer but MCP/Fetch do not; option 2 even rendered as `2.Yes` with no space in the MCP case; the subagent Bash gate has only two options, so its "No" is `2. No` and there is no `3.` line). A three-option gate still matches only via `3. No` — its `2. Yes, and always allow…` line does not prefix-match `2. No` — so widening to `2. No` adds the two-option variant without loosening the three-option match. Matching rules, decided: trim each line and prefix-match (`❯ 1. Yes` may be followed by more text; `3. No` matches `3. No, and tell Claude…`); tolerate a missing space after the option number (`2.No`/`3.No`), since the MCP capture proves the renderer can drop it (`2.Yes`); the `❯` glyph is the highlight marker and is required on the option-1 line.
- **Bottom-of-screen window + ordering, to kill quoted-text false positives:** both anchor lines must fall within the **last 10 lines** of the capture (trailing blanks are already dropped by `captureNow`), with the `❯ 1. Yes` line **before** the `No`-option line. In all five fixtures the menu occupies the final ~6 lines (the subagent capture's extra header/warning lines sit above the question, not below the menu). This prevents the classic false positive: a claude session merely *printing* gate-shaped text (quoting a captured fixture, catting this very plan) scrolls that text up the screen while the real input line stays at the bottom — such a screen must not trigger injection.
- **Do NOT anchor on the question or footer:** `Do you want to proceed?` is Bash/MCP-only (Fetch differs), and the footer varies too — either alone would produce misses. They're at most weak corroboration.
- **Approval keystroke: `"\r"` for every claude variant** (Enter accepts the highlighted `❯ 1. Yes`). This is exactly why Enter-accept-default beats `"1"` or `"y"`: one keystroke covers Bash, Fetch, and any future variant whose option ordering or wording changes, as long as the default stays "Yes" (see Decision 4). **`"y"` does not work — these are numbered menus, not `y/n` prompts.**
- **Still uncaptured:** claude's **edit-approval** gate (Write/Edit are auto-accepted in this session's mode, so it couldn't be surfaced) and any **plan-mode** prompt. Both must be captured and checked against the `❯ 1. Yes` + `2. No`/`3. No` anchor before shipping, in case their structure differs.

### opencode / codex (out of scope — later work)

Not captured, and **not implemented by this plan** (Decision 0). Extending auto-approval to them is deliberate later work: gather their gate strings and approval keystrokes the same way (drive each to a real prompt, capture, record the anchors + keystroke), then add a table entry per harness. Until then `-y` on those harnesses is a usage error.

## Verified codebase facts that shape the design

- **The screen reader already produces exactly the input detection needs.** `HarnessScreenReader` (`harness-screen.ts:22-71`) mirrors one harness PTY into an `@xterm/headless` terminal, and ~1s after each output burst settles (`CAPTURE_DELAY_MS = 1000`, `harness-screen.ts:16`) reads the visible rows into `{ text, capturedAt }`, dropping trailing blank lines (`captureNow`, `harness-screen.ts:62-70`). It exposes `latestCapture()` (`harness-screen.ts:41`) but currently has **no push notification when a new capture is taken** — this plan adds a minimal `onCapture` callback (see §1). A permission gate makes the harness go quiet awaiting input, so it reliably triggers a capture; the ~1s settle delay is the auto-approval latency and is acceptable.
- **`HarnessManager` already owns per-PTY observer maps with a single disposal path.** `screenReaders` and `recorders` are `Map<ptyId, …>` populated in `spawnTab` (`harness-manager.ts:111-112`) and disposed together on the `pty` `exit` bus event via the constructor subscription (`harness-manager.ts:20-26`). A third `autoApprovers` map slots in identically — one added line in `spawnTab`, one added disposal line in the constructor. Both `open` and `openFromProfile` funnel through `spawnTab`, so there is one wiring site.
- **Writing to a PTY is a one-liner that already exists.** `PseudoterminalManager.input(id, data)` (`pseudoterminal-manager.ts:30`) forwards a string straight to `session.write(data)`. Injecting the approval keystroke is `this.managers.pty.input(ptyId, keystroke)` — the same path client keystrokes take, so the harness cannot tell the difference.
- **The `harness` command is special-cased ahead of the command registry and parsed in one place.** `command-manager.ts` dispatches `/^harness\b/i` straight to `HarnessManager.run(input)`, which calls `parseHarnessCommand` (`harness.ts:24-45`). That parser already scans the token list for `-w`/`--workspace` and `--offline` (`harness.ts:38-39`) and returns `{ name, workspace, offline, label? }`; adding `-y`/`--yes` is one more `.some(...)` scan plus a field on `HarnessParsed` (`harness.ts:11-14`). The workspace-requirement validation (Decision 2) belongs here too, returning `{ error }`.
- **The notifications feed is the app's "application notification" surface, and it is drop-if-closed.** `notify(managers, event, tabLabel, message?)` (`notifications.ts:60-67`) appends a line to the singleton notifications tab **only if it is already open** (`notificationsTab(managers)` guard) — there is no OS-level/toast notification anywhere in the codebase (grep for `osascript`/`node-notifier`/`Notification` finds only in-app feed code and CSS). `NotificationEventType` is a closed union of five values (`notifications.ts:8-13`); `shouldNotify` (`notifications.ts:20-36`) makes `manual` the one event that always fires (bypassing both the per-event config toggle and active-tab focus suppression). An `auto-approve` event should behave like `manual` — always eligible, bypass focus suppression — since the user explicitly armed it and should always learn an approval happened, even while focused elsewhere. **Consequence to state plainly:** if the notifications tab is closed, the auto-approve notice is dropped, exactly like every other event (`specs/notifications.md` § Drop-if-closed). This is a known limitation, not a bug to design around here.
- **`-w`/`--offline` prove the flag + tab-field pattern, but no `Tab` field is needed here.** `offline` is parsed (`harness.ts:39`), threaded through `spawnTab` (`harness-manager.ts:99`), stored on the tab (`tab.offline = offline`, `harness-manager.ts:105`; `types.ts:404`) and consumed by the sandbox. Auto-approve differs: it drives a *server-side observer*, not sandbox spawn args, so it is threaded through `spawnTab` as a parameter but kept in the `autoApprovers` map — not written onto the serializable `Tab`/`HarnessView` (which are view data). This mirrors how the screen reader itself is kept off the tab.
- **Detection ground truth for claude is already captured** (see Ground truth — five variants gathered live). The same `harness capture <label>` (`harness-manager.ts:50-59`) path is how opencode/codex would be captured if/when they're added later, but that's out of scope here.
- **ssh tabs share the harness view but have no screen reader.** ssh tabs carry a `harness` payload (`name: 'ssh'`) but spawn outside `HarnessManager.spawnTab` (see `specs/harness.md` § Monitoring, and `harness-screen-capture.md`'s verified facts), so they never get a reader and are never auto-approve candidates — the `-y` flag only reaches `spawnTab`, which ssh never calls.
- **File-size limit is 200 lines (`ai/guidelines/code-guidelines.md`).** `harness-manager.ts` is already 128 lines; the added wiring is a few lines and stays well under. Detection + the approver class go in their own new files, not into an existing one.

## Proposed changes

### What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Rendered, de-ANSI'd screen text per harness, settled after output | `HarnessScreenReader` / `latestCapture()` | `harness-screen.ts:22-71` |
| Per-PTY observer maps + single `exit`-driven disposal | `screenReaders` / `recorders` maps | `harness-manager.ts:16-26, 111-112` |
| Inject bytes into a harness PTY | `PseudoterminalManager.input(id, data)` | `pseudoterminal-manager.ts:30` |
| `harness` flag parsing (`-w`, `--offline`) + `HarnessParsed` union | `parseHarnessCommand` | `harness.ts:11-45` |
| "Always-fire, bypass focus" notification event | `manual` event | `notifications.ts:20-36, 46-54` |
| Table-driven, pure, unit-tested matcher style | `src/recognizers/bash.ts` | `recognizers/bash.ts` |
| Obtaining real gate screens to build patterns against | `harness capture <label>` | `harness-manager.ts:50-59` |
| Vitest + colocated test style | `harness-manager.test.ts`, `harness.test.ts` | `src/*.test.ts` |

### 1. `HarnessScreenReader` gains an `onCapture` callback — `src/harness-screen.ts`

Add an optional constructor parameter `onCapture?: (capture: ScreenCapture) => void`, invoked at the end of `captureNow()` (`harness-screen.ts:69`) right after `this.capture` is set. This is the minimal, single-responsibility-preserving way to push each fresh capture to an observer without a new bus channel or polling. Existing callers (the `new HarnessScreenReader(id, cols, rows)` in `spawnTab`) pass no callback and are unaffected. (The monitor feed's existing poll-on-flush path, `monitor-harness-feed.ts`, is deliberately left as-is — this callback is additive.)

### 2. Detection + approver — `src/harness-auto-approve.ts` (new)

Two exports, kept in one focused module (well under 200 lines):

- **`detectPermissionGate(text: string, harnessName: string): boolean`** — a pure function, `recognizers/`-style, taking the capture text first and the harness name second (all later sections use this order). `harnessName` is kept in the signature so the table is extensible, but **only `'claude'` has an entry** (Decision 0); any other harness → `false`. Claude's match is the structural anchor from Ground truth as tightened in Detection strategy: within the last 10 lines of the capture, a trimmed line prefix-matching `❯ 1. Yes` followed (later) by one prefix-matching `2. No` or `3. No` (optional space after the number — the menu can be two options, per the subagent capture). Returns true only on that high-confidence match; tuned for near-zero false positives (a false positive silently auto-approves something the user didn't intend). **Security-rule note:** any regex here must satisfy `security/detect-unsafe-regex` — prefer plain `String.startsWith`/`includes` on trimmed lines over regex.
- **`class HarnessAutoApprover`** — constructed with `{ harnessName, approve: (keystroke: string) => void, notify: (message: string) => void }` (no tab label — messages are label-free per Decision 8; the wiring's `notify` callback supplies the label to the feed) and holding the approval keystroke (claude: `"\r"` — Enter-accept-default, per Ground truth) plus two pieces of loop-guard state: `lastApprovedText: string | undefined` and `stuckNotified: boolean`. Its single method `onCapture(capture: ScreenCapture): void`:
  1. If `!detectPermissionGate(capture.text, harnessName)` → the screen moved off a gate: clear `lastApprovedText`, reset `stuckNotified`, return.
  2. If `capture.text === lastApprovedText` → the prior approval didn't clear this exact gate; do **not** re-inject (loop guard, Decision 5); if `stuckNotified` is false, set it and `notify('Auto-approve could not clear the permission prompt; standing down')`; return.
  3. Otherwise: `approve(keystroke)`, set `lastApprovedText = capture.text`, reset `stuckNotified`, and `notify('Auto-approved a permission prompt')`.

  `approve`/`notify` are injected callbacks so the class is trivially unit-testable with no `Managers` and no PTY.

### 3. Wiring into `HarnessManager` — `src/harness-manager.ts`

- Add a `private autoApprovers = new Map<string, HarnessAutoApprover>()` alongside `screenReaders`/`recorders` (`harness-manager.ts:16-17`), and add its disposal to the constructor's `pty` `exit` subscription (`harness-manager.ts:20-26`) — one line, symmetric with the existing two.
- Thread `autoApprove: boolean` through the whole launch path: `run` passes `parsed.autoApprove` into `open` (`harness-manager.ts:44`, `return this.open(parsed.name, …)`), `open` passes it into `spawnTab`, and `openFromProfile` passes `false` (Decision 7).
- In `spawnTab`, when `autoApprove` is set, construct the `HarnessAutoApprover` for this tab and register it in `autoApprovers` under the PTY id. Its two callbacks close over values already in scope: `approve` forwards the keystroke via `this.managers.pty.input(id, …)` (`pseudoterminal-manager.ts:30`, `input`), and `notify` calls `notify(this.managers, 'auto-approve', label, message)` (`notifications.ts:60`) — note `id` is assigned before the screen reader is constructed (`harness-manager.ts:109`, `const id = this.managers.pty.spawn(…)`), so both closures are well-formed. Then pass the approver's `onCapture` as the screen reader's new callback (§1). When `autoApprove` is off, the reader is constructed exactly as today (no callback) and no approver is created.

### 4. Command parsing + validation — `src/harness.ts`

- Add `autoApprove: boolean` to the launch branch of `HarnessParsed` (`harness.ts:11-14`) — non-optional, like `workspace`/`offline`, so it is `false` (never `undefined`) when the flag is absent.
- In `parseHarnessCommand`, scan for `-y`/`--yes` the same way `-w`/`--workspace` is scanned (`harness.ts:38`, `rest_.some((t) => t === '-w' || t === '--workspace')`): exact-match on both spellings.
- Enforce Decision 0 (claude-only) **first**: if `autoApprove && name !== 'claude'`, return `{ error: '-y/--yes is only supported for the claude harness.' }`. This comes before the `-w` check because adding `-w` wouldn't make `harness opencode -y` valid — the harness choice is the real blocker, so pointing at `-w` would misdirect.
- Then enforce Decision 2: if `autoApprove && !workspace`, return `{ error: '-y/--yes requires -w/--workspace: auto-approval is only allowed in a sandboxed workspace.' }`.
- Update the usage strings (`harness.ts:26, 43`) to include `[-y]`.

### 5. Notification event type — `src/notifications.ts`

- Add `'auto-approve'` to `NotificationEventType` (`notifications.ts:8-13`).
- In `shouldNotify`, make it always-eligible + focus-bypassing like `manual`: extend the early return at `notifications.ts:27` (`if (event === 'manual') return true;`) to also return true for `auto-approve` — this keeps the ambient-event `switch` below it exhaustive without a new case. Rationale: it's an explicitly-armed, security-relevant event the user must always see, regardless of active tab and config toggles. (The `tabLabel === NOTIFICATIONS_LABEL` guard above it stays first, as for `manual`.)
- In `notificationText` (`notifications.ts:46-54`), add an `auto-approve` case shaped exactly like the `manual` case — `` `${tabLabel}: ${detail ?? ''}` `` — rendering the label-free message the approver supplies (Decision 8), e.g. `claude: Auto-approved a permission prompt`.

### 6. Tests

- **`src/harness.test.ts`** (extend): `harness claude -w -y`/`--yes` parse into `autoApprove: true` (in either flag order); `harness claude -y` (no `-w`) returns the exact `-w` error; `harness opencode -y` / `harness opencode -w -y` return the exact claude-only error (and the claude-only check wins over the `-w` check for a non-claude harness); `-y` doesn't disturb `as <label>`/`--offline` parsing; a plain `harness claude -w` parses with `autoApprove: false`.
- **`src/harness-auto-approve.test.ts`** (new): `detectPermissionGate(text, harnessName)` with `'claude'` against the five captured claude fixtures (Bash in/out-of-project, two-option subagent Bash, Fetch, MCP — all positive) and negative fixtures (ordinary output, a *resolved* prompt, an unrelated `y/n`-looking prose line, and a gate-shaped block quoted *above* the last-10-line window — the quoted-text false-positive case) — plus a claude-shaped gate with `harnessName` `'opencode'`/`'codex'` → `false` (only claude has a table entry, Decision 0). `HarnessAutoApprover.onCapture` with spy `approve`/`notify`: approves (with `"\r"`) + notifies once on a gate; the loop guard suppresses a second inject when the identical gate text recurs and fires the "could not clear" notice exactly once even across three identical recurrences; approving resumes after the screen changes to a *new* gate; a non-gate capture clears state (a subsequent identical-to-before gate approves again) and does nothing itself.
- **`src/harness-manager.test.ts`** (extend): with `autoApprove` on, driving a gate-shaped screen through the real reader (emit a `pty` `data` event with the gate text, then `vi.advanceTimersByTimeAsync(1001)` — the existing pattern at `harness-manager.test.ts:91-92`) results in `managers.pty.input` being called with `"\r"`; with it off, gate-shaped output is never injected into. Two stub adjustments: add an `input: vi.fn()` spy to the `pty` stub in `makeManagers()` (`harness-manager.test.ts:23-46`, which currently has only `spawn`/`spawnDimensions`), and mock `./notifications.js` with `vi.mock` the same way `./harness-capture-file.js` is mocked (`harness-manager.test.ts:8-10`) so the notification path needs no notifications tab — assert the mock was called with `'auto-approve'` and the tab label.
- **`src/notifications.test.ts`** (extend): `shouldNotify` passes `auto-approve` even when the originating tab is the active tab, even with all config toggles off, and even with `config` undefined (parity with the existing `manual` describe block at `notifications.test.ts:35-47`), but still never for the notifications tab's own label; the rendered line for `auto-approve` is `` `<label>: <message>` ``. `notificationText` is currently module-private (`notifications.ts:46`) — export it so the rendering can be asserted directly, matching how `shouldNotify`/`formatTimestamp` are already exported and tested.

### 7. Docs — `specs/harness.md` + `specs/notifications.md` + `help.md`

- **`specs/harness.md`**: add `-y`/`--yes` to the command grammar (`specs/harness.md:11-13`, the fenced `harness <name> [as <label>] [-w]` block) and a new `## Auto-approve permissions` section documenting: the flag is **claude-only** (with the exact error on `opencode`/`codex`) and requires `-w` (with the exact error otherwise); detection watches the rendered-screen capture (text, not an image) ~1s after output settles, matching claude's gate menu (highlighted `❯ 1. Yes` plus a final `2. No`/`3. No` option); on a detected gate the Enter keystroke (`\r`) is injected — **not** `y`, because it's a numbered menu — and an `auto-approve` notification is recorded, rendered as `<label>: Auto-approved a permission prompt`; the loop guard and its `<label>: Auto-approve could not clear the permission prompt; standing down` notice; and that it is memory-only per launch. Cross-link [[workspaced-agent]] for the safety rationale and note the notifications-tab-must-be-open caveat, linking [[notifications]]. State that opencode/codex support is future work.
- **`specs/notifications.md`**: add `auto-approve` to the events list (`specs/notifications.md:47-61`, the `### Events that notify` section — its "Five event types" opener becomes six) as an always-fires/focus-bypassing event alongside `manual`, and mention it in the `### Focus suppression` section's bypass sentence.
- **`help.md`**: update the `harness` row (`help.md:23`) to mention `-y` (auto-approve claude permission prompts; requires `-w`; claude only), matching the terse one-line style of the existing rows.
- **No `public-documentation/` changes** — same tier decision as `harness-screen-capture.md` § 6; a separate explicit step if wanted.

## Implementation order

1. Ground truth for claude is **already gathered** (see Ground truth — five variants captured live; the detector anchors on `❯ 1. Yes` + `2. No`/`3. No`, keystroke `"\r"`). Before shipping, capture claude's still-unseen **edit-approval** and **plan-mode** variants (needs a session where edits aren't auto-accepted) and confirm they carry the same `❯ 1. Yes` + final-`No`-option structure; if a variant differs, widen the anchor accordingly. (opencode/codex are out of scope — Decision 0.)
2. Add the `onCapture` param to `HarnessScreenReader` (§1) + a small extension to `harness-screen.test.ts` (a callback fires with the capture on settle). Self-contained; keeps everything green.
3. Build `src/harness-auto-approve.ts` (§2) + `harness-auto-approve.test.ts` (§6) in isolation against the captured fixtures — the highest-risk part, validated before any wiring.
4. Add the `auto-approve` notification event (§5) + `notifications.test.ts` coverage.
5. Parse `-y`/`--yes` + the `-w` requirement in `harness.ts` (§4) + `harness.test.ts` coverage.
6. Wire everything into `HarnessManager.spawnTab` + constructor disposal (§3) + `harness-manager.test.ts` coverage.
7. Manual end-to-end: `harness claude -w -y`, open the notifications tab, drive the harness into a permission prompt, confirm it is auto-approved within ~1-2s and a notification line appears; confirm `harness claude -y` (no `-w`) errors; confirm `harness opencode -w -y` errors with the claude-only message; confirm a normal `harness claude -w` still gates as before.
8. Update `specs/harness.md`, `specs/notifications.md`, `help.md` (§7).
9. `./scripts/run.mjs check-diff` after every step; leave a single `npm run check` for the human at the end.

## Out of scope

- **opencode and codex auto-approve** (Decision 0) — this plan is claude-only. Adding a harness means capturing its gate variants, adding a detector-table entry + approval keystroke, and relaxing the parse-time claude-only guard; the design is structured so that's purely additive.
- **`profile launch` auto-approve** (Decision 7) — a fast-follow that threads `autoApprove?` through `ProfileHarnessEntry` → `openFromProfile` → `spawnTab` like `model`.
- **LLM/vision confirmation of gates** — a possible fast-follow adding an optional ACP/monitor-style second-opinion pass before injecting, for harnesses whose prompts are too variable for a reliable text heuristic. v1 is heuristic-only (Decision 1).
- **OS-level/toast notifications** — none exist in the app today; the notification is the in-app feed line, subject to the drop-if-closed rule (`specs/notifications.md`). Adding a real push channel is separate work.
- **Approving anything other than a yes/proceed gate** — e.g. free-text prompts, model/tool selection menus, or destructive confirmations the user might *not* want auto-approved. The detection table matches only clear permission-to-proceed gates; anything ambiguous is left for the human (near-zero false positives is the design constraint).
- **A config toggle / global default for auto-approve** — v1 is strictly opt-in per `harness` launch via `-y`. A `.janissary/config.json` default is a possible later addition.
- **ssh tabs** — they never get a screen reader (verified fact), so `-y` has no effect there; the flag only reaches `spawnTab`, which ssh never calls.
- **Persisting/restoring auto-approve across `--relaunch`** — harness tabs are memory-only by design (Decision 6).

## Verification

- `./scripts/run.mjs check-diff` after each step.
- Unit tests: `npm run test:diff:server` covering the extended `harness-screen.test.ts`, new `harness-auto-approve.test.ts`, and extended `harness.test.ts`, `harness-manager.test.ts`, `notifications.test.ts`.
- Manual end-to-end (the decisive check — detection accuracy can't be proven by tests alone):
  - `harness claude -w -y`, `notifications` open in a dock; drive the harness to a real permission prompt (e.g. ask it to run a shell command that its CLI gates, and a Fetch, and an MCP tool call, and a subagent task whose shell command gates — the two-option variant — to exercise all four captured gate shapes); confirm each gate is dismissed automatically within ~1-2s and a `claude: Auto-approved a permission prompt` line appears in the feed.
  - `harness claude -y` (no `-w`) → the exact `-w` usage error, no tab created.
  - `harness opencode -w -y` → the exact claude-only usage error, no tab created.
  - `harness claude -w` (no `-y`) → prompts still gate normally (no injection), proving the flag is genuinely opt-in.
  - Confirm no false positives: run a normal `-w -y` session that produces `y/n`-looking prose or a resolved prompt and verify nothing is injected.
  - Confirm the loop guard: if a gate's keystroke is (deliberately, in a test build) wrong, the approver injects once, then stands down with the "could not clear" notice rather than spamming.
- Confirm `specs/harness.md`, `specs/notifications.md`, and the `help.md` row read consistently with their surroundings.
