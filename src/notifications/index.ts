import type { NotificationConfig } from '../config.js';
import type { Managers } from '../managers.js';
import { getConfig } from '../config.js';
import { NOTIFICATIONS_LABEL } from './tab.js';
import { notificationText, provenanceTimestamp } from './format.js';
import { deliverNotification } from './deliver.js';

// The events that can feed the notifications tab. Five are ambient (a background tab's own
// activity); `manual` is an explicit `notify <message>`, `auto-approve` is a workspaced harness's
// auto-approved permission gate, `editor-suggest` is an in-editor persona-suggestion query's
// failure or empty reply, `question` is an agent waiting for a human answer,
// `transcript-unavailable` reports that a harness tab's session record could not be found, so the
// tab is limited to screen snapshots, `ssh-recording-failed` and `harness-recording-failed` report
// that an ssh tab's or a harness tab's session recording was abandoned, so nothing more of that
// session lands on disk, and `file-operation`
// reports a failed file-navigator copy, paste, move, delete, or undo/redo replay.
// `open-unsupported` reports that `open` found no opener for a file's extension — a deliberate
// action's answer, and the one dispatcher error a file navigator activation can produce, where the
// originating tab renders rows rather than a transcript.
// `plugin-note` is a line a tab plugin reported through
// its own `notifyUser` capability — a track a playlist had to drop, say — as opposed to
// `plugin-failure`, which the host reports when a plugin breaks. `e2e-browser-gone` reports that a
// `-b` tab's browser is no longer there — a failed launch, a browser that exited, or a guard that
// died are one event to the user, since the consequence is the same: `connect()` now fails.
// Explicit events are always eligible and bypass focus suppression.
// `remote-session` reports what the sessions tab just did to a remote session — detached,
// attached, ended, forgotten — so the change is on the record even when the tab is closed. It
// carries its line verbatim, exactly as `remote-session-terminated` does, and is deliberately distinct
// from it: that one reports a session ending on its own, this one reports a decision the user made.
// `launch-refused` reports a harness or agent launch stopped because its name clashes with an open
// tab, a sessions-table row, or something running on the target host, and
// `launch-workspace-cleaned` reports a leftover workspace removed so a launch could go ahead. Both
// carry their line verbatim, as does `launch-root-cloned`, which reports a missing project root a
// remote launch cloned onto its host after the user accepted the offer. `remote-refused` reports a remote host refusing a request after its
// workspace was ready: the session is still alive, so the tab stays open and this line is the only
// sign of the refusal. It carries its line verbatim too.
export type NotificationEventType =
  | 'schedule-late'
  | 'remote-session-terminated'
  | 'remote-session'
  | 'state-change'
  | 'incoming-message'
  | 'schedule-fire'
  | 'agent-start'
  | 'rate-limited'
  | 'manual'
  | 'auto-approve'
  | 'editor-suggest'
  | 'question'
  | 'transcript-unavailable'
  | 'ssh-recording-failed'
  | 'harness-recording-failed'
  | 'e2e-browser-gone'
  | 'file-operation'
  | 'open-unsupported'
  | 'plugin-failure'
  | 'plugin-note'
  | 'launch-refused'
  | 'launch-workspace-cleaned'
  | 'launch-root-cloned'
  | 'remote-refused';

// A background tab's own activity. Both the per-event opt-in toggle and focus suppression (the
// active tab never notifies about its own activity) apply to these five.
export type AmbientNotificationEvent =
  | 'state-change'
  | 'incoming-message'
  | 'schedule-fire'
  | 'agent-start'
  | 'rate-limited';

// Everything else, derived rather than restated: a new member of `NotificationEventType` lands here
// automatically and then fails `EXPLICIT_EVENTS` below until it is classified.
export type ExplicitNotificationEvent = Exclude<NotificationEventType, AmbientNotificationEvent>;

// Each ambient event and the config toggle that opts into it. Keyed by the union, and valued by a
// key of the config, so neither a new ambient event nor a renamed toggle can slip through — the
// same reason `CLIENT_FRAME_TYPES` and `CAPABILITIES` are keyed by their unions.
export const AMBIENT_EVENTS: Record<AmbientNotificationEvent, keyof NotificationConfig['events']> = {
  'state-change': 'stateChange',
  'incoming-message': 'incomingMessage',
  'schedule-fire': 'scheduleFire',
  'agent-start': 'agentStart',
  'rate-limited': 'rateLimited',
};

// The events that are always eligible and bypass focus suppression. `manual` is an explicit
// `notify`, `auto-approve` an auto-approved permission gate, `editor-suggest` a persona query's
// failure, `question` an agent waiting on a human, `open-unsupported` an `open` that found no
// opener. The rest — a lost transcript, an abandoned
// recording, a dead browser, a failed file operation, a plugin's own note or breakage — bypass it
// for one shared reason: the tab it happened to is very often the tab the user is watching, which
// is exactly the case focus suppression would discard.
//
// Keyed by the union so an eighteenth event stops compiling here until it is classified, rather
// than falling through a `default` arm to `false` and never reaching the feed.
export const EXPLICIT_EVENTS: Record<ExplicitNotificationEvent, true> = {
  'schedule-late': true,
  'remote-session-terminated': true,
  'remote-session': true,
  manual: true,
  'auto-approve': true,
  'editor-suggest': true,
  question: true,
  'transcript-unavailable': true,
  'ssh-recording-failed': true,
  'harness-recording-failed': true,
  'e2e-browser-gone': true,
  'file-operation': true,
  'open-unsupported': true,
  'plugin-failure': true,
  'plugin-note': true,
  'launch-refused': true,
  'launch-workspace-cleaned': true,
  'launch-root-cloned': true,
  'remote-refused': true,
};

function isAmbient(event: NotificationEventType): event is AmbientNotificationEvent {
  return Object.hasOwn(AMBIENT_EVENTS, event);
}

// Whether an event should be recorded, given the config and the active tab. Defensive against the
// tab feeding itself. An explicit trigger always fires, subject only to the tab being open (enforced
// in `notify`); an ambient one is subject to its toggle and to focus suppression.
export function shouldNotify(
  config: NotificationConfig | undefined,
  event: NotificationEventType,
  tabLabel: string,
  activeLabel: string,
): boolean {
  if (tabLabel === NOTIFICATIONS_LABEL) return false;
  if (!isAmbient(event)) return EXPLICIT_EVENTS[event];
  if (tabLabel === activeLabel) return false;
  if (!config) return false;
  return config.events[AMBIENT_EVENTS[event]];
}

// Record a notification for an event on `tabLabel`. The config + focus rules run first, via
// `shouldNotify`: an event they reject costs nothing, records nothing, and shows nothing, which is
// what keeps the ambient toggles a volume control rather than a way to fill the screen. An event
// they accept always reaches the queue and the record file; which surface shows it — the feed, a
// toast, or an escalation to the feed — is `deliverNotification`'s decision. `shouldNotify` has to
// be asked before any of that because it reads the active tab's label, which opening a tab changes.
// `message` is the event-specific detail (see `notificationText`).
export function notify(
  managers: Managers,
  event: NotificationEventType,
  tabLabel: string,
  message?: string,
  openFile?: string,
  openTab?: string,
  // When this event was actually detected. Genuinely optional rather than defaulting to now: a
  // caller that supplies one is reporting something it detected earlier — a remote harness's
  // auto-approve report, queued while detached and replayed on reattach — and such a notification
  // is dated in the feed and deliberately never toasted, since a toast carries no time.
  detectedAt?: Date,
): void {
  const activeLabel = managers.tab.cur().label;
  if (!shouldNotify(getConfig().notifications, event, tabLabel, activeLabel)) return;
  const color = managers.tab.byLabel(tabLabel)?.dotColor;
  const recordedAt = new Date();
  const output = notificationText(event, tabLabel, message);
  deliverNotification(managers, {
    event,
    tabLabel,
    message: output,
    ...(color && { color }),
    entry: {
      input: '',
      output,
      // The dot label is the notification's provenance header — when, then who — so the line reads
      // `● 8:32pm janus: <message>`. `fromColor` (looked up from tabLabel) still colors the dot.
      from: `${provenanceTimestamp(detectedAt ?? recordedAt)} ${tabLabel}`,
      fromColor: color,
      ...(openFile && { openFile }),
      ...(openTab && { openTab }),
    },
    detectedAt: detectedAt ?? recordedAt,
    recordedAt,
    ...(openFile && { openFile }),
    ...(openTab && { openTab }),
  }, detectedAt !== undefined);
}
