# Harness idle notification

**Complexity: 5/10** — no new protocol message, no dependency, and no persistence, and the two halves (a deferred badge clear and a delayed notification) are each small; what earns the 5 over a plain 4 is that this now rewrites a rule `tabs.md` states as unconditional ("focusing a tab always clears its badge"), applies that rewrite to every one of the badge's sources rather than one, spans server and web, and coordinates three interacting timers — a dwell, an escalation arm, and an escalation fire — whose interaction has one genuinely awkward edge.

Janissary already tells a user that a backgrounded harness has stopped working: when a hidden
harness tab's debounced working→idle transition commits, `applyBusyTransition` raises that tab's
unread badge, and the flag icon in the tab strip is what surfaces it without switching to the tab
first. That is a glance-level signal, and it has two weaknesses this feature closes.

First, it says a tab is waiting, not that anyone was told — so with a fleet of harness tabs
running, a tab that finishes while the user is reading a transcript elsewhere is badged and then
forgotten. A badged hidden harness tab that is **still** badged after 30 seconds gets a
notification; the badge stays the fast, silent signal and the notification is the escalation for a
tab the user walked past.

Second, the badge cannot tell a glance from a stop. Focusing a tab clears its badge immediately and
unconditionally, so flicking through the strip to find a tab silently discards the fact that a
harness finished — and, under the escalation above, would cancel its notification. A badge raised on
a tab is now cleared only once that tab has been the **active** tab for three continuous seconds, or
has been made visible in a way that leaves no question it was seen. The flag is still never drawn on
the tab you are looking at; the state simply survives a glance.

## Design decisions

### Settled by the existing code and specs

**The one apply point for the transition is `applyBusyTransition` (`src/harness/busy-status.ts:77`,
`export function applyBusyTransition(managers, label, transition)`), and it is already shared.** The
local capture handler (`busyStatusHandler`, same file, line 92) and a remote harness's reported
`busy-transition` frame (`src/remote/pty-session.ts:69`, `onBusyTransition: (busy, unread) => deliver(...)`,
which calls `applyBusyTransition(managers, agentName ?? '', { busy, unread })`) both route through
it. Arming the escalation in its idle branch therefore covers a local harness and a remote one with
the same code and **no protocol change** — the far side already sends the committed transition
(`src/remote/serve-processes-detect.ts:29,44` runs the same `BusyTracker` there), and the near side
is where the tab and the notification system both live. `agentName` is the owning tab's label and
is always set for a harness spawn (`src/remote/pty-session.ts:53-60` says so, and
`registerRemotePty` sets it). A frame that arrives while the channel is still attaching is queued
and flushed in a `queueMicrotask` (`src/remote/pty-session.ts:44-47,71-75`), which a 30-second timer
does not care about; no special handling is needed for it.

**The debounce is already settled upstream of that point.** `BusyTracker.observe`
(`src/harness/busy-status.ts:43`) returns a transition only once the idle reading has held across
two consecutive captures, so "commits" already means a settled idle, not a transient pause
mid-generation.

**The badge is raised by exactly one function, and it never badges the active tab.**
`markUnreadTab` (`src/tab/transcript/events.ts:52`) is the sole raiser, and its early return refuses
a missing tab, a docked tab, the active tab, and the visible split-pane selection. Two consequences
this plan leans on. The badge surviving a focus needs no new mechanism: the raise happened while the
tab was hidden, and it is the *clear* that becomes deferred. And while a tab is active its badge can
only ever be a leftover from before it was made active, so the dwell timer has nothing to do but
clear that leftover.

**The badge is cleared in eight places today, by six distinct rules, and there is no single owner to
observe.** `hasUnread = false` is assigned directly at `src/tab/split-selection.ts:41` and `:43`
(`repairPaneSelections`), `src/tab/operations.ts:62` (`setDock`), `src/tab/navigation-commands.ts:23`
(`setActiveTabOp`), `:48` (`reorderTabOp`), `:68` (`reorderTabToOp`), `src/tab/dock.ts:26`
(`applyDock`), `src/tab/selection-operations.ts:24` (`clearUnread`), and `src/tab/close.ts:41`
(`closeTabOp`). `src/tab/operations.ts:62` and `src/tab/dock.ts:26` are the same rule stated twice —
both clear on `dock === null`. Eight sites is too many to add a ninth concern to, and deferring a
clear at eight call sites would be exactly the kind of scattered branch the architecture guidance
warns against; so they consolidate behind one primitive.

**The six visibility rules and the busy rule are not the same rule, and the difference decides the
escalation.** Five of the six sites make a tab visible or selected *because the user went to it* —
`setActiveTabOp`, `reorderTabOp`, `reorderTabToOp`, `closeTabOp`'s newly-active tab, and
`applyDock`'s undock-to-center — and those are the ones that become dwell-gated.
`repairPaneSelections` clears two tabs for one reason, and only half of it is a dwell: the active tab
dwells, the visible split-pane selection clears immediately, because a tab rendered in the other
half of the screen is on screen and the badge question is already answered. Separately,
`applyBusyTransition`'s going-busy branch (`src/harness/busy-status.ts:80`) and
`selection-operations.clearUnread` are **not** visibility paths at all — the harness resuming work is
not the user looking at it — so both stay immediate. That distinction is load-bearing: an immediate
busy-path clear is what cancels an escalation for a harness that went back to work, and a dwell-gated
one would let the notification fire for a tab that is visibly blinking again.

**A badge clear is a named, low-frequency signal, so it gets its own bus channel.** `src/bus.ts`
states the rule for itself: `state: dirty` "fires on essentially every mutation", and a named
low-frequency signal is given its own channel — which is why `schedules` (`:132`), `sessions`
(`:145`), and `databases` (`:150`) each have one. A badge clear is low-frequency, so the signal
belongs on a new `tabs` channel rather than as a second variant of `StateEvent`.

**The escalation is decided at fire time, and the test it re-asks is the badge's own predicate.**
`applyDock` (`src/tab/dock.ts:14`) deliberately does **not** clear `hasUnread` when a tab is docked
into a sidebar (it only clears on the `dock === null` branch, line 26), because a docked tab is
permanently visible chrome that may go on holding a badge from before. So the badge alone cannot
answer "still unseen" — a tab badged and then docked keeps its badge while being permanently
visible. Re-asking `markUnreadTab`'s eligibility test when the grace period ends closes that, and it
closes the "do not notify a tab you are looking at" rule at the same time, because that same
predicate already refuses the active label and the visible-secondary label. One re-read, three
answers; no separate mechanism is built for either.

**The pending escalation is module-level singleton state, released by the harness feature.** The arm
site is `applyBusyTransition(managers, label, transition)`, so the owner has to be something
`managers` can reach or a module import. A singleton in its own focused module is that, and it keeps
the concern out of `TabManager` and out of the `Managers` registry — the latter matters because
adding a manager means entries in `MANAGER_DISPOSE_ORDER` and `MANAGER_TAB_RELEASE`
(`src/managers.ts:83,139`) plus `src/controller/create-managers.ts`, and their compile-time
completeness checks (`src/managers.ts:120-123,157-163`) and `src/managers.test.ts` would all have to
move for a feature that owns one map. `messageBus` (`src/bus.ts:165`) is the existing precedent for
module-level singleton state in `src/`, and this singleton is the one thing that genuinely needs a
`tabs`-channel subscription — the dwell produces clears and never consumes them, so it takes none.

**The dwell timer is the same shape, in the module that owns the badge.** There is only ever one
candidate — the active tab — so it is one handle, not a map. It is a tab concern rather than a
harness one now that it gates every badge source, so it lives in `src/tab/` and is released by
`TabManager`, which owns `activeTab` and the badge. `TabManager` has no `dispose` today, so one is
added; `MANAGER_DISPOSE_ORDER` already lists `tab` (`src/managers.ts:113`), so the order does not
move, and `tab` is deliberately absent from `MANAGER_TAB_RELEASE` because it orchestrates the
tab-close walk itself (`src/managers.ts:133-134`).

**Tab close and shutdown have real release paths already.** `HarnessManager.closeTab(label)`
(`src/harness/manager.ts:35`) is already named in `MANAGER_TAB_RELEASE` (`src/managers.ts:139`), so
the tab-close walk already calls it for every harness tab, and `HarnessManager.dispose()`
(`:28`) runs in `MANAGER_DISPOSE_ORDER`. Those are the escalation's two release points, and they give
the acquire/release symmetry the architecture principles require. Note that `closeTabOp`
(`src/tab/close.ts:41`) clears the badge of the tab that *becomes* active, not of the tab being
closed — so closing a badged harness tab produces no badge clear for that label, and the `closeTab`
release is the only thing that stops its pending escalation. That is correct, not a redundancy.

**A tab's label is immutable, so keying the pending escalation by label is safe.** No non-test
source assigns to `Tab.label`; `renameTabOp` (`src/tab/rename.ts`, imported at
`src/tab/operations.ts:8`) changes the tab's `title`, which is its display name, not its identity.
Two consequences: a tab renamed during the grace period is still found by its label, and — because
`notify` reads `title ?? label` when it renders (`src/notifications/index.ts:180`) — the line is
rendered at fire time, so it announces the tab under whatever it is called by then.

**Dwell is a single global timer, not a per-client one, and that is forced rather than chosen.**
`activeTab` and `hasUnread` are both server state shared by every connected client — the dock
decisions in `product/specs/notifications.md` § Toasts and escalation already speak of "each client"
for *presentation* while the underlying tab facts are shared. A per-client dwell would need a new
client→server signal and would make one badge readable as "seen" and "unseen" depending on which
browser window you looked through it, which is not a state the current model can express. One server
timer, one shared `activeTab`, and the badge means what it already means.

**The client already knows which tab is active, so hiding the badge on the tab you are looking at
costs one render condition.** `TabItem` takes `active` as a prop (`web/src/TabItem.tsx:28,35`) and
renders the flag on `tab.hasUnread` alone (`:99`). That is the only client consumer of the field.
`TabItem` also already receives `windowFocused` (`:36`) and dims the border when the window lacks OS
focus — so the client *could* tell the server about window focus if the dwell condition ever wanted
it. This plan's dwell deliberately does not (see the product decisions), and the plan's claim of no
new protocol message survives on that basis.

**No shared delay facility exists to reuse; the timer patterns to model are `ScheduleManager`'s
`unref`'d one-second tick (`src/schedule/manager.ts:57`) and a plain one-shot `setTimeout` with a
`stop()` that clears it.** Both new timers are `unref`'d, the same one-shot treatment
`src/pty-reap.ts:45` gives its delayed signal and for the same stated reason — a pending timer must
never keep the process alive on its own.

**A notification in this codebase is a held record with a rendered line, and that is what this
feature issues.** `notify(managers, event, tabLabel, message, options)`
(`src/notifications/index.ts:169`) runs the eligibility gate, then the queue, the record file, the
feed, and the toast, all through `deliverNotification` (`src/notifications/deliver.ts:35`).

**The event is classified explicit, so no configuration changes at all.** `src/config.ts:11-19`
(`NotificationConfig['events']`, five keys) and its defaults at `src/config.ts:74-82` (all `false`)
are untouched, and `product/specs/application-config.md` needs no row. The taxonomy is built so this
is a one-line-per-table change rather than a risky one: `ExplicitNotificationEvent` is derived by
`Exclude` (`src/notifications/index.ts:74`), and `EXPLICIT_EVENTS` (`:97`) is a `Record` keyed by
that union, so the new member **fails the compiler** until it is classified rather than falling
through a `default` arm. Being explicit also means `shouldNotify` (`:126`) returns it eligible
without consulting the config — which is what makes it work with no setup.

**`state-change` is the exact precedent for the event being added, and deliberately not its
classification.** `product/specs/notifications.md` § Events that notify already carries
`state-change` — "an agent tab's busy flag clears (busy → idle)" — rendering `Agent '<name>' finished`
(`src/notifications/format.ts:47`) as one of the five ambient, toggled, default-off events. A
harness tab going idle is the same event for the other kind of agent, so the wording follows the
same `Agent '<name>' <phrase>` shape — but it is **explicit**, not ambient: a no-toggle event that
always fires was chosen over a `stateChange`-shaped opt-in that would leave the feature inert until
someone edited `config.json`.

**`markUnread` currently reports nothing, so the arm site cannot know whether the badge was
raised.** `markUnreadTab` is a mutator whose ineligible cases are an early `return` and whose result
is `void`. Splitting its test out as a pure predicate is what lets the transition site, the dwell
timer, and the escalation's fire path all ask the same question. Arming is driven off the raise's
return value, so **"hidden" is enforced by construction** rather than by a second check.

### Product decisions, from the user

1. **"Issue a notification" means the existing in-app notification** — the queue, the record file,
   the feed, and a toast when the feed is not on screen. Inherited wholesale, including repeat
   folding (`src/notifications/queue.ts:60`, `repeats`, which keys on tab and message with time
   excluded, so a tab that idles repeatedly folds to one feed line reading `(N times)` while the
   corner still toasts each time, because `deliverNotification` only rewrites the feed on a fold
   and still falls through to the toast) and burst escalation (three arrivals inside ten seconds
   docks the feed open and clears the corner, `src/notifications/deliver.ts:45`).
2. **Both causes arm it.** The debounced working→idle commit *and* a recognized permission gate that
   nothing is going to answer — which stops the dot and badges the tab immediately without waiting
   for the debounce (`product/specs/harness.md` § Busy/ready status). One rule, not two: any badged
   hidden harness tab still badged after the grace period notifies. A harness blocked on a prompt is
   the strongest case for telling the user, because the run cannot continue until they answer.
   Consequently the wording cannot say "finished" — see decision 6.
3. **Harness tabs only**, local and remote. An ACP `agent` tab keeps its existing `state-change`
   event; ssh tabs and shell tabs are untouched (an ssh tab reuses the harness *view* shape but runs
   no harness binary and has no busy tracking — `src/harness/observers.ts:62`, `sshRuntime`, builds
   no capture wiring).
4. **Explicit, no toggle.** See the classification decision above.
5. **A fixed 30-second constant** for the grace period and a **fixed 3-second constant** for the
   dwell, both exported and named, like `TOAST_VISIBLE_MS` (`web/src/toasts/toast-queue.ts:23`) and
   `RESUME_THRESHOLD_MS` (`src/resume-watch.ts:3`). No new configuration surface.
6. **The line reads `Agent '<name>' is waiting`**, with the tab's displayed name — its `title` when
   it has one, otherwise its label, which is what `notify` already passes to `notificationText`
   (`src/notifications/index.ts:180,182`). One wording is true for both causes: the spec's own
   description of what the badge means is that "the harness has either finished its current run or
   is otherwise waiting".
7. **The event type is `harness-idle`**, kebab-case like every other member of the union. It is
   written verbatim into the `event` field of every line in `.janissary/notifications.json`, so it is
   user-visible to anyone reading that file.
8. **The feed line links back to the tab.** `notify`'s `openTab` option (`src/notifications/index.ts:148`)
   is set to the tab's label, the same way a `question` line links to the asking tab. Clicking is how
   the user acts on being told. A toast carries no link of its own — clicking it reveals the feed,
   where the linked line is.
9. **At most one pending escalation per tab.** A new commit *replaces* any pending escalation for
   that tab, restarting the 30 seconds, so a harness running short repeated turns stays quiet and one
   notification arrives 30 seconds after it finally settles. Escalations never stack. Separately, when
   the unread flag is removed the pending escalation is **cancelled outright** and its timer
   released, not merely ignored when it expires.
10. **Sleep and wake notify.** If the machine sleeps with an escalation pending, the timer fires when
    the event loop resumes rather than being discarded as stale. The tab really was idle and really
    was unattended, and the user has just returned, which is when the information is worth most; the
    line is timestamped at delivery, so it reads as current and it is true. No staleness threshold and
    no `schedule-late`-style suffix — this is not a command that ran late, it is a report of a
    transition the user has not seen. Nothing is built for this: a `setTimeout` fires when the event
    loop resumes, so the ceiling is that the line is timestamped at delivery rather than at the
    transition, and the upgrade path, if that ever proves wrong, is a `detectedAt` on the `notify`
    call (`src/notifications/index.ts:150`), which exists precisely for a caller reporting something
    it detected earlier.

The following arrived from the gap review in Step 2, which compared this plan against the products
that own the capability — Claude Code's `Notification` hook, VS Code's
`accessibility.signals.terminalBell`, cmux, agent-of-empires, and agterm — and surfaced dwell-to-read
as the one depth gap worth closing. The others found are declined and listed under **Out of scope**.

11. **Dwell-to-read, from agent-of-empires' `UNREAD_DWELL (3s)`**, which clears a session's marker
    only after it has been kept selected for three seconds, explicitly "distinguishing scrolled past
    from stopped to read". A badge raised on a tab is cleared on focus only after that tab has been
    the **active** tab for three continuous seconds. Window focus is deliberately irrelevant: the
    condition is "the active tab for 3s", nothing more, which is what keeps this plan free of a new
    client-to-server focus signal even though `TabItem` could supply one (`web/src/TabItem.tsx:36`).
    "Continuous" means switching tabs resets the clock, so there is one pending dwell at a time and
    a glance is never mistaken for a stop.
12. **The rule applies to every badge source**, not just the harness's. A `msg` delivery, a shell
    command finishing, an agent question, a notification-feed line, a transcript append — all of them
    leave a badge that survives a glance. One rule, and `tabs.md` § Unread badge § Clearing becomes
    one named exception rather than a rewrite of the unconditional statement it replaces.
13. **The flag is still never drawn on the active tab.** The state survives; the rendering does not.
    `web/src/TabItem.tsx:99` gains `&& !active` against the prop it already receives. agent-of-empires
    does the same and says why: suppressing the auto marker on the active row "avoids a flash" for a
    marker that clears a beat later. `tabs.md`'s "the active tab never shows the badge" therefore
    survives as a *rendering* rule rather than a state rule, which is the weaker and more accurate
    claim.
14. **All five visibility clear sites become dwell-gated** — `setActiveTabOp`, `reorderTabOp`,
    `reorderTabToOp`, `closeTabOp`'s newly-active tab, and `applyDock`'s undock-to-center — because
    all five make a tab active or selected *because the user went to it*. The busy-path clear and
    `clearUnread` do not, and stay immediate.
15. **The visible split-pane half of `repairPaneSelections` clears immediately**, and only its
    active-tab half dwells. A tab rendered in the other half of the screen is on screen, which is the
    same judgement `markUnreadTab` already makes by refusing to badge that pane at all. It also
    cannot work the other way: a split-pane tab is visible but not active, so it could never complete
    an active-tab dwell, and its badge would never clear.
16. **An escalation is discarded at fire time if its tab is the active tab or the visible split-pane
    selection** — the notification never lands on a tab you are looking at. This needs no new
    mechanism: the fire path already re-asks the badge's own eligibility predicate, and that
    predicate already refuses both labels. The consequence is accepted deliberately — a one-second
    glance at t=29s does not stop a notification firing at t=30s, because by then the user is not
    looking at that tab, which is exactly the "a glance is not a read" rule applied honestly.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The committed working→idle transition, applied in one place for local and remote harnesses alike | `src/harness/busy-status.ts:77` (`applyBusyTransition`) |
| The debounce that decides when a transition has "committed" | `src/harness/busy-status.ts:43` (`BusyTracker.observe`) |
| The badge's eligibility rule — docked, active, and visible-secondary tabs are excluded | `src/tab/transcript/events.ts:52` (`markUnreadTab`) |
| The badge field, and its in-memory-only policy | `src/tab/types.ts:323` (`Tab.hasUnread`) |
| The badge on the wire, riding the existing state snapshot | `src/protocol/tab.ts:66`, `src/tab/view.ts:55` |
| The client's only consumer of the badge, and the `active` prop it already has | `web/src/TabItem.tsx:99`, `:28` |
| The notification entry point and its eligibility gate | `src/notifications/index.ts:169` (`notify`), `:126` (`shouldNotify`) |
| The ambient/explicit classification, and the `Record` that forces a new event to be classified | `src/notifications/index.ts:74,79,97` |
| Delivery to the queue, the record file, the feed, or a toast — with repeat folding and burst escalation | `src/notifications/deliver.ts:35` (`deliverNotification`) |
| The `openTab` link option a feed line and a toast carry | `src/notifications/index.ts:148` (`NotifyOptions`) |
| How an event's line is worded, and the `Agent '<name>' …` shape | `src/notifications/format.ts:42` (`notificationText`), `:47` |
| The existing agent-tab analog of this exact event, and its spec entry | `state-change` in `product/specs/notifications.md` § Events that notify |
| The bus's own rule that a named low-frequency signal gets its own channel, and its singleton precedent | `src/bus.ts:129-150`, `:165` |
| `MessageBus.clear()`, already how a test resets bus subscriptions | `src/bus.ts:107` |
| `unref` on a one-shot `setTimeout`, for the same reason these timers need it | `src/pty-reap.ts:45`, `src/harness/capture/remote.ts:31` |
| The `detectedAt` option, the upgrade path if sleep-timestamping ever proves wrong | `src/notifications/index.ts:150` |
| `TabManager`'s place in the dispose order, and why it is absent from the tab-release list | `src/managers.ts:113`, `:133-134` |
| Harness-tab close and shutdown release points, already in the walk | `src/harness/manager.ts:35` (`closeTab`), `:28` (`dispose`) |
| The timer patterns to model — an `unref`'d tick, and a one-shot `setTimeout` with a stop | `src/schedule/manager.ts:57`, `src/remote/attach.ts:54` |
| Fake timers in tests, already used across this area | `src/harness/busy-status.test.ts`, `src/tab/manager.test.ts` |

## Proposed changes

### The badge clear, centralized and made observable

**A pure eligibility predicate extracted from the badge rule.** `src/tab/transcript/events.ts` gains
a predicate beside `markUnreadTab` that answers, for a tab and the current active and secondary
labels, whether that tab is one the badge may be raised on — the ineligible cases `markUnreadTab`'s
early return already encodes, with no mutation. `markUnreadTab` becomes that predicate plus the
assignment it guards, and returns whether it raised. Only two signatures widen: `TabManager.markUnread`
(`src/tab/manager.ts:143`) and `selection-operations.markUnread`
(`src/tab/selection-operations.ts:18`). Every existing caller ignores the result and so is
unaffected — the four direct `managers.tab.markUnread(...)` calls at `src/shell/manager.ts:207`,
`src/shell/promotion.ts:52`, `src/harness/busy-status.ts:83`, `src/notifications/tab.ts:107`, and the
transcript plumbing through `src/tab/transcript/state.ts:25,32,46`. The abstract `markUnread` on
`TabTranscriptState` (`src/tab/transcript/state.ts:25`) **stays `void`**: only `applyBusyTransition`
needs the answer, and it calls the manager directly.

**One primitive for clearing, emitting only on a real change.** The same module gains
`clearUnreadTab`, which clears the badge when the tab exists **and the flag was actually set**, emitting
a typed badge-clear event carrying the label on the bus's new `tabs` channel only in that case, and
returning whether it cleared. The "only on a real change" clause is load-bearing, not a nicety: a
dwell timer that fires on a tab with no badge must not emit, because a spurious `unread-cleared` for
that label would cancel a pending escalation the dwell knows nothing about. The primitive takes no
mode or reason parameter — clearing is clearing, and every site states in a comment and in the spec
whether its own clear is deferred or immediate. All eight writes route through it, and the duplicate
`dock === null` rule in `src/tab/operations.ts:62` and `src/tab/dock.ts:26` collapses into one.
`selection-operations.clearUnread` (`src/tab/selection-operations.ts:22`) keeps its signature and
stays immediate, because the harness going back to work is not a visibility event. The new
`src/tab/*` → `src/tab/transcript/events.js` import edge is the one
`src/tab/selection-operations.ts:3` already makes, and `events.ts`'s own imports (`./log.js`,
`../runtime.js`, `../types.js`, `../../bus.js`, `../../agent/types.js`) reach none of the modules
gaining the edge, so no cycle is introduced.

**A new `tabs` channel on the bus.** `src/bus.ts` gains a one-member union
`{ type: 'unread-cleared'; label: string }` and a `tabs` key on `BusChannels`, following
`src/bus.ts:150` (`DatabasesEvent`) exactly.

### The dwell

**A module-level dwell owner in `src/tab/dwell.ts`.** One pending handle, never a map — there is only
one active tab — and an exported 3-second constant beside it. Its contract:

- `begin(resolveTabs, label)` — called by the five visibility clear sites instead of clearing
  directly. **Every call replaces whatever was pending, before anything else is decided**, which is
  what makes the interval continuous per tab: switching tabs resets the clock rather than leaving a
  stale candidate to fire against the tab the user just left. The replacement is unconditional, and
  has to be — selecting a tab that carries no badge is still a tab switch, and a candidate left
  counting down would fire against the wrong tab. Only after the replacement does the guard decide
  whether a new dwell is worth arming at all: there is nothing to take off a tab with no badge, and a
  tab cannot be badged while it is the active one, so nothing can appear afterwards to be missed.
  That keeps the common case — moving around a strip of tabs nobody is waiting on — free of timers.
  It records the label, and does **not** read "whoever is active" at fire time — a glance that is
  followed by switching tabs must never clear the tab that was glanced at. It subscribes to nothing:
  the dwell *produces* a clear and never needs to hear one, because an immediate clear that lands
  first leaves the pending dwell a harmless no-op that the emit-only-on-change clause absorbs.
- On expiry it calls `clearUnreadTab` for the recorded label, so a completed dwell takes the same
  emitting path as every other clear and the escalation's cancel is reached through one route. A tab
  that closed, was reordered away, or was already cleared in the meantime clears nothing and emits
  nothing. The timer is `unref`'d, and nothing is built for a machine that sleeps through the three
  seconds: the timer fires on wake and clears, which is what should happen to a badge on a tab the
  user had already chosen to stay on.
- `dispose()` — clears the pending dwell and drops the module's state. Called from the new
  `TabManager.dispose()`, the first `dispose` on that class; `MANAGER_DISPOSE_ORDER` already places
  `tab` (`src/managers.ts:113`) and `Controller.shutdown` disposes in that order, so nothing else
  moves.

**Every production caller passes a live resolver, and the defaults stay for the tests that do not.**
`removeTabAt` maps every surviving tab into a fresh object, so an array captured at selection time is
a detached copy by the time the dwell fires, and a dwell writing to one would leave the real tab
badged for good while still announcing the clear — which cancels that tab's escalation too. So each
deferring site takes an optional `resolveTabs` and hands the dwell a closure reading the live field.
`applyOpenResult` is the sixth such caller and threads one through to its own `repairPaneSelections`
call. The `resolveTabs ?? (() => tabs)` defaults remain, because `src/tab/dock.test.ts` and
`src/tab/split-selection.test.ts` call those functions positionally and rely on them; making the
parameter required would mean rewriting test suites to satisfy a production concern.

**Each site states which kind of clear it is, in a comment and in the spec.** Five visibility sites
defer, `repairPaneSelections` defers for the active tab and clears immediately for the visible
split-pane selection, and `selection-operations.clearUnread` clears immediately.

**The open and activation path dwells too, in both strip shapes.** `repairPaneSelections` reaches the
dwell on the way to repairing panes, and its early return for a strip with no split — every
unsplit strip, the common case — sits above that call. So the dwell is begun *before* the return, for
the tab that is active after the selection is resolved. On an unsplit strip there is nothing to swap
between panes, so that tab is the one the caller passed in and naming it needs none of the pane
filtering the split branch does, which is what lets one call cover both shapes rather than a second
one added alongside. Without it, a badged tab reached by `open` would keep its badge for the session
while the same tab reached by a click lost it after three seconds — and since the badge is what arms
the escalation, a harness that finished in that state would be badged forever and never announced.
The split branch keeps its own immediate clear for the other pane's selection, which the unsplit path
never reaches.

**A `state: dirty` at dwell completion, not at focus.** Each of the five sites still emits its own
`state: dirty` as it does today, and the completed dwell emits one more, so the client learns the badge
is gone at the moment it actually goes. A client snapshot taken during the dwell shows the badge
still set, which is the truth.

**The render change breaks an existing test, and that is the point.** `web/src/TabItem.tsx:99` gains
`&& !active` against the prop it already receives. No other client file changes — `hasUnread` has no
other consumer in `web/src/` — but `web/src/TabStrip.test.tsx:120`, "shows the unread badge when
hasUnread is set", currently renders a single tab with `activeTab={0}` and asserts the flag *on the
active tab*, which is exactly the rendering this feature removes. It has to be rewritten to put the
badged tab at a non-active index, and a companion case has to pin the new behavior. Treat the failure
as confirmation that the change landed, not as a test to delete.

### The escalation

**A new `src/harness/idle-notification.ts` holding the pending escalation per tab label**, in the
shape of `messageBus`, with an `arm`, a `cancel`, and a `dispose`, plus the exported 30-second
constant it waits. Its contract:

- `arm(managers, label)` — called from `applyBusyTransition`'s idle branch **only** when
  `managers.tab.markUnread(label)` reported that it actually raised the badge. It clears any pending
  escalation for that label first, so escalations replace rather than stack, then starts the 30
  seconds. The `managers` reference is captured in the timer's closure rather than stored on the
  instance. The timer is `unref`'d.
- The instance subscribes to the `tabs` channel's badge-clear event at module scope, and its
  subscription is released by `dispose()`.
- The timer callback re-reads the tab and asks the eligibility predicate again. Tab gone, or no
  longer eligible — docked into a sidebar, the active tab, or the visible split-pane selection — and
  it discards silently: no record, no feed line, no toast, nothing emitted to the client. The badge
  check is a cheap third condition that stands behind the cancel path, particularly for a close,
  which clears a different tab's badge. Otherwise it calls
  `notify(managers, 'harness-idle', label, undefined, { openTab: label })` and drops the entry,
  letting `shouldNotify` and `deliverNotification` apply every existing rule.
- `cancel(label)` — clears the pending escalation for one label, if any. Reached from the
  badge-clear event with no further wiring, and directly from `HarnessManager.closeTab`
  (`src/harness/manager.ts:35`), the release for a closed tab.
- `dispose()` — unsubscribes, clears every pending escalation, and drops the module's state. Called
  from `HarnessManager.dispose()` beside the existing `this.runtimes.dispose()`.

**The event itself.** `src/notifications/index.ts` gains `'harness-idle'` in `NotificationEventType`
and in `EXPLICIT_EVENTS`; `AmbientNotificationEvent` and `AMBIENT_EVENTS` are untouched, as is
`src/config.ts`. `src/notifications/format.ts` gains a `harness-idle` arm rendering
`Agent '<tabName>' is waiting`. No other switch arm changes — the union is exhaustive, so the
compiler names the new member until both tables have it.

**No `state: dirty` is emitted for arming or cancelling**, and the dwell's effect on the existing
gate is not a new emit either. Arming changes nothing a client renders — the badge was already raised
before the escalation is armed, and the existing `dotSnapshot` comparison in `busyStatusHandler`
(`src/harness/busy-status.ts:66,101`) already fires the push for that flip. The remote path's
unconditional `state: dirty` at `src/remote/pty-session.ts:71` is left exactly as it is.

**Two things that must not be mistaken for arm sites.** Only `applyBusyTransition` arms an
escalation. The other badge-raising sources do not, and must not: `appendTab`
(`src/tab/transcript/events.ts:104`), `updateRunningEntry`'s `hooks.markUnread` (`:42`), and
`replaceLatestNotification` (`src/notifications/tab.ts:107`) all call `markUnread` and none of them
starts a clock. So an `msg` delivered to a badged-but-unarmed harness tab, or a second badge raised
by any other source during the grace period, leaves an already-armed escalation where it is — which
is correct, because the tab is still unseen. And a badge raised on the notifications tab itself can
never arm one, since the notifications tab is not a harness tab.

**How dwell and the escalation interact, stated once.** Focus no longer clears a badge, so focus no
longer cancels an escalation; a completed dwell clears the badge, and that clear reaches the
escalation's `cancel` through the one `tabs`-channel event. The harness going back to work still
cancels immediately, because that clear is not dwell-gated. And at fire time the escalation asks the
eligibility predicate, which refuses the active and visible-secondary labels, so a notification
never lands on a tab currently on screen. Nothing else couples the two timers.

**Landing order, so typecheck and tests stay green at each step.** The pieces are independent until
they are wired: (1) the predicate, `markUnreadTab`'s boolean, and the two widened signatures;
(2) the `tabs` bus channel; (3) `clearUnreadTab` with its emit-only-on-change, and the eight call
sites rerouted onto it with no behavior change yet; (4) the `harness-idle` event in
`NotificationEventType`, `EXPLICIT_EVENTS`, and `notificationText`; (5) the dwell module,
`TabManager.dispose()`, and the five sites switched to deferred — the first user-visible change;
(6) the `&& !active` render condition, which turns `web/src/TabStrip.test.tsx:120` red; (7) the
escalation module and its `arm` in `applyBusyTransition`, plus the two release calls in
`HarnessManager`; (8) the specs and docs. Steps 5 and 7 are the two checkpoints worth a manual look.
Nothing here depends on another plan, and nothing waits on a package update.

**File sizes are not at risk, and the response if one trips is extraction.** The additions are one
union member, one `EXPLICIT_EVENTS` entry, one `notificationText` arm, one bus channel, and two
small new modules. `src/notifications/index.ts` is the largest file touched at 204 raw lines, and
`max-lines` counts with `skipBlankLines` and `skipComments` against a file that is heavily commented
— the two added code lines will not move it. `src/tab/manager.ts` is 221 raw lines and gains a
three-line `dispose`; `ai/guidelines/architecture-principles.md` § 3 already names it as one of the
files under pressure, so if the limit is hit, extract per `ai/guidelines/code-guidelines.md`. Do not
compact code, drop comments, or tighten spacing.

### Specs and documentation, in the same change

**`product/specs/tabs.md` § Unread badge** is the main edit. § Clearing is rewritten: focusing a tab
no longer clears its badge outright but starts a 3-second dwell, the five activation paths are named,
`repairPaneSelections`'s active half dwells while its split-pane half clears immediately, the
busy-path clear is called out as *not* dwell-gated and why, and dwell resets when the active tab
changes. § Marking gains a sentence that a badge raised while hidden survives a brief focus. The
"the active tab never shows the badge" claim moves from a state rule to a rendering rule, stated
against `TabItem`'s `active` prop. § Persistence is unchanged and still correct — `hasUnread` remains
in-memory only.

**`product/specs/harness.md` § Busy/ready status** gains the escalation next to the badge rule it
extends: the 30 seconds, the two arming causes, the replace-don't-stack rule, the cancel-on-clear
rule, and the fact that the badge now survives a glance so the cancel arrives on a dwell rather than
on the focus.

**`product/specs/notifications.md`** § Events that notify gains the `harness-idle` entry with its
exact line and its `openTab` link; § Focus suppression names it among the events that bypass focus
suppression, noting that in practice it can only arise for a background tab, because a tab that is
active at fire time is discarded by the eligibility re-read.

**`documentation/user-documentation/tab-types/notifications.md`** gains the new line in its list of
what the feed reports, and the sentence that there is "no sound and no OS-level notification" stays
true and untouched. The tab-strip badge's behavior is documented in
`documentation/user-documentation/getting-started/tabs.md:28,45` alongside the existing badge text.

**`documentation/user-documentation/getting-started/tabs.md:45`** is a required edit, not a nicety: its
badge bullet ends "Selecting it clears the flag", which is precisely the sentence this feature
replaces. It becomes "Selecting it clears the flag once you have been on it for a moment", with the
reason, and the rest of that bullet — docked tabs never badge, the badge is in-memory only — is
already correct and stays. The strip screenshot caption at `:28` mentions the flag in passing and
needs no change.

**`help.md` and `product/specs/application-config.md` do not change** — there is no new command and no
new configuration.

## Tests

Colocated, following the conventions of each area, with vitest fake timers (`vi.useFakeTimers`,
already the pattern in `src/harness/busy-status.test.ts` and `src/schedule/manager.test.ts`):

- `src/tab/dwell.test.ts` (new) — the dwell's own behavior, with the module released in `afterEach`
  so its state does not leak: beginning a dwell clears the badge only after 3 seconds and not before;
  beginning a second dwell replaces the first and only the second label is ever cleared; **a pending
  dwell is abandoned when the newly selected tab carries no badge, so a badge never comes off the tab
  the user just left**; a dwell begun on a tab with no badge clears nothing and emits nothing; a tab
  that closed or was reordered away mid-dwell clears nothing; a dwell still pending when its tab is
  docked into a sidebar completes and clears, since `applyDock` does not clear on the docking branch
  and would otherwise leave the badge with nothing to remove it; the tabs array is resolved when the
  interval is up rather than when the dwell began; a completed dwell that changes something pushes a
  state event; `dispose()` releases the pending dwell.
- `src/tab/transcript/events.test.ts` — the split: the predicate returns false for a docked tab, the
  active tab, and the visible secondary, true otherwise; `markUnreadTab` returns whether it raised
  and sets the flag only when it did; `clearUnreadTab` clears only an existing tab, returns whether
  it changed anything, emits exactly one `unread-cleared` event carrying the label when it did, and
  emits **nothing** when the flag was already false — with a test that pins the reason, namely that a
  spurious emit would cancel a pending escalation.
- The visibility sites, each with a case proving its own site defers rather than clears. Three of them
  need a `TabOperationsPort` and so live in `src/tab/operations.test.ts` beside its `makePort` helper
  rather than in the suites that hold the pure array computations: `reorderTab` and `reorderTabTo`
  carry the selected tab to its new index and re-arm its dwell, and `closeTab` dwells the tab it
  promotes to active — each asserting the badge is still set immediately and gone after the interval,
  and read back through `port.tabs` because `removeTabAt` maps each survivor into a fresh object.
  `src/tab/dock.test.ts` covers the other two directly: undocking a badged tab back to the center
  defers its badge, while docking it into a sidebar leaves the badge in place and arms nothing.
  `src/tab/split-selection.test.ts` keeps its own case, asserting the split-pane selection's clear is
  still synchronous and the active half defers.
- `src/tab/manager.test.ts` — the open and activation path through `TabManager.applyOpenResult`:
  the selected tab's badge survives the call and comes off after the interval, in both strip shapes.
  The split case also replaces the manager's tabs with fresh objects the way a close does, so the
  live array is proven to be what the dwell resolves. And the no-timer parts: `clearUnread` still
  clears synchronously, and the new `TabManager.dispose()` drops a pending dwell — the release
  `Controller.shutdown` reaches through `MANAGER_DISPOSE_ORDER`.
- `src/harness/idle-notification.test.ts` (new) — the escalation's own behavior: a badged tab
  notifies once when the grace period ends; `arm` twice before it ends produces one notification, 30
  seconds after the second; a badge clear cancels so nothing fires; **`cancel` fires on the
  badge-clear signal even when the badge is put back afterwards, so nothing but that subscription can
  have stopped it**; `cancel(label)` and `closeTab` cancel; a tab gone, docked, active, or the
  visible split-pane selection when the timer fires notifies not at all; a tab that was never badged
  is never armed; `dispose()` releases every pending escalation. Neither this file nor
  `src/harness/busy-status.test.ts` clears the bus in its teardown: `MessageBus.clear` would drop the
  escalation's module-scope subscription, and the two cases above would then pass through the
  fire-time backstop instead of the mechanism they name.
- `src/harness/busy-status.test.ts` — the arm site: the debounced ready commit that badges a hidden
  tab arms one, and the first transient ready capture that only starts the debounce does not; the
  permission-gate stop arms one when `stuck`; nothing arms for a visible tab, for a claude
  `recap:`-exempted commit, or for a transition back to busy. Plus one end-to-end case, because it is
  the only place the halves meet: drive real captures through `busyStatusHandler` with fake timers and
  the real notification system behind it, and assert that a hidden tab's committed idle transition
  produces a queued `harness-idle` notification 30 seconds later, and none at 29 — and that dwelling
  its tab for 3 seconds before the 30 seconds produces none at all.
- `src/notifications/format.test.ts` — the `harness-idle` arm renders `Agent 'foo' is waiting`.
- `src/notifications/index.test.ts` — `harness-idle` is in `EXPLICIT_EVENTS`, `shouldNotify` returns
  it true with no config present, and `notify` with `openTab` produces a line and a toast that carry
  the link. The "no toast while the feed is visible" and burst-escalation halves are already covered
  for other events and are not re-tested here.
- `src/remote/pty-session.test.ts` — a `busy-transition` frame from a far-side harness arms the
  escalation exactly as a local capture does, and the session's release cancels it.
- `web/src/TabStrip.test.tsx` — `web/src/TabStrip.test.tsx:120` is **rewritten**, not deleted: it
  currently asserts the flag on the *active* tab, which the `&& !active` condition removes, so the
  badged tab moves to a non-active index. Two new cases pin the behavior: the flag is not rendered on
  the active tab even while `hasUnread` is true, and it is rendered on an inactive one. The existing
  "shows no badge when hasUnread is false" case at `:130` is unaffected.

## Out of scope

The first five are the gap-review findings declined in Step 2, recorded here so no later phase
proposes them again:

- **Suppressing the notification while other tabs in the fleet are still busy.** `audio-hooks` reads
  the `Stop` payload's `background_tasks` array and "stays silent until nothing is still running",
  which kills the chime storm when a short test in one tab notifies during a long build in another
  (`https://www.claudepluginhub.com/skills/chanmeng666-audio-hooks-plugins-audio-hooks/audio-hooks`).
  The escalation is per tab and has no awareness of the rest of the fleet. Adding it means a
  fleet-wide busy count and re-arm semantics for tabs suppressed and then released.
- **Not re-notifying until the user acknowledges.** `dimokol/claude-notifications` tracks a
  notified-but-unacknowledged stage and re-fires silently unless the previous stage was acknowledged
  (`https://github.com/dimokol/claude-notifications`). The escalation re-notifies on every commit;
  the queue folds the feed line to `(N times)` but the corner toasts each time.
- **A durable "keep in needs attention" state.** agterm's maintainer argues the badge is the wrong
  tool for a reminder, since reading it is exactly what clears it, and points at a durable per-session
  status as the right tool (`https://github.com/umputun/agterm/discussions/236`); cmux persists unread
  indicators across session restore. `hasUnread` is in-memory only and cleared by looking, so "I saw
  it and still cannot deal with it" has no representation.
- **A fleet-level unread or waiting count.** cmux puts a total unread count on the dock icon and a
  unified panel listing every unread notification with jump-to-pane
  (`https://mintlify.wiki/manaflow-ai/cmux/features/notifications`). Janissary's feed shows lines with
  no count anywhere. Adjacent to, but distinct from, the declined rate-limit rollup in
  `product/backlog/features.md:41`.
- **Recording suppressed escalations instead of discarding them silently.** pacslate's rule is that
  "what gets dropped is logged rather than silently discarded, so the filter can be inspected instead
  of trusted blind" (`https://github.com/pacific-slate/pacslate`). The fire path here discards
  silently by design, so a user who wonders why they were not told has nowhere to look. Declined
  rather than added, because it reverses a decision already made here.
- **Replacing the time-window grace period with a state filter.** The same `audio-hooks` documentation
  argues that a duration filter "is a better answer than debounce, which suppresses by time window and
  so cannot tell a burst of fast tools from one genuinely long command". The 30-second grace period
  *is* a time window, and every category leader researched fires immediately rather than delaying
  (Claude Code's `Notification` hook, VS Code's `accessibility.signals.terminalBell`, cmux's OSC
  rings). The grace period was chosen deliberately and stays; a state-based condition such as
  "suppress while the rest of the fleet is busy" is the first declined gap above and is the shape this
  would take if it were ever revisited.
- **An OS-level notification, a sound, or a terminal bell.** Already specified as absent
  (`product/specs/notifications.md` § Delivery model) and separately scoped and costed in
  `product/backlog/features.md:35`. This plan escalates through the surfaces Janissary has; the
  deferred entry stays deferred.
- **The declined `attention` command and chord** (`product/backlog/features.md:61`), which jumps to
  the next waiting tab rather than announcing that one is waiting.
- **The declined per-harness `rate-limited` badge and fleet summary** (`product/backlog/features.md:41`).
  A rate-limited harness stops blinking and badges unread, so it is indistinguishable here too, and
  this feature does not fix that — it only escalates the badge it already produces.
- **ACP `agent` tabs**, which keep `state-change`; **ssh tabs** and **shell tabs**, which have no busy
  tracking at all. The dwell rule, being about the badge, does apply to every tab kind.
- **Any change to how the busy dot or the debounce are computed**, or to `BusyTracker`'s
  classification, `BUSY_TABLE`, `endsWithRecap`, or the recap exemption.
- **Any configuration surface** — no `NotificationConfig` key, no runtime command, and both periods
  are constants.
- **Any client-side timer or local state.** The client renders; the server decides. The only client
  change is the `&& !active` render condition.
- **Persisting the badge or the dwell across a relaunch.** `hasUnread` stays in-memory only, as
  `product/specs/tabs.md` § Persistence already states.

## Verification

`$janissary/scripts/run.mjs check-diff` after the implementation.

Then, by hand, the escalation: launch a harness tab, start work in it, switch to another tab, and let
it go idle. The flag icon appears at once and no toast does. Leave it alone for 30 seconds and the
notification arrives — `Agent '<name>' is waiting` in the corner, with the tab's dot color, clickable
to focus the harness tab — and the same line is in the notifications feed and in
`.janissary/notifications.json`. Then confirm the negative paths, one at a time:

- click the badged harness tab, look for under three seconds, and click away — no notification ever
  arrives, and the flag is still on the tab you left;
- come back to it, stay four seconds, and the flag disappears with no notification;
- answer a permission prompt with `-y` auto-approve landing after the badge was raised, and no
  notification follows;
- dock the badged harness tab into a sidebar, and confirm no notification follows even though the
  badge is still up;
- run a short turn that goes idle, busy, and idle again inside 30 seconds, and confirm exactly one
  notification, 30 seconds after it settled;
- close the badged harness tab during the grace period, and confirm no notification follows;
- open the notifications feed before the grace period ends, and confirm the line is in the feed and no
  toast appears.

Then the dwell, across badge sources: deliver an `msg` to a hidden tab, click its tab, and watch the
flag survive a one-second glance and vanish after three. Repeat for a shell command finishing and for a
notification-feed line. Confirm the flag is never visible on the tab you are looking at, that
switching tabs resets the three seconds, that a tab in the split pane clears immediately when it
becomes visible there, and that a harness going back to work still drops its badge at once.

Finally the unchanged paths: focusing, reordering, closing, docking, and undocking a tab behave as
before apart from the deferred clear; `harness`, `ssh`, `agent`, and `acp` launches and closes are
unaffected; and a session that sleeps through the grace period notifies on wake rather than staying
silent.
