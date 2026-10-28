import type { NotificationConfig } from '../config.js';
import type { Managers } from '../managers.js';
import { getConfig } from '../config.js';
import { NOTIFICATIONS_LABEL } from './tab.js';
import { notificationText, provenanceTimestamp } from './format.js';
import { deliverNotification } from './deliver.js';

export type NotificationEventType =
  | 'schedule-late'
  | 'remote-session-terminated'
  | 'remote-session'
  | 'state-change'
  | 'schedule-fire'
  | 'system-schedule-fire'
  | 'agent-start'
  | 'rate-limited'
  | 'harness-idle'
  | 'manual'
  | 'auto-approve'
  | 'auto-approve-no-workspace'
  | 'auto-resume'
  | 'editor-suggest'
  | 'question'
  | 'transcript-unavailable'
  | 'ssh-recording-failed'
  | 'harness-recording-failed'
  | 'shell-recording-failed'
  | 'shell-transcript-failed'
  | 'e2e-browser-gone'
  | 'file-operation'
  | 'open-unsupported'
  | 'tab'
  | 'plugin-failure'
  | 'plugin-note'
  | 'launch-refused'
  | 'launch-workspace-cleaned'
  | 'launch-root-cloned'
  | 'remote-refused'
  | 'layout'

// Background activity requires its own opt-in toggle and is suppressed for the active tab.
export type AmbientNotificationEvent =
  | 'state-change'
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
  // An ACP consumer finishing a turn or otherwise becoming idle.
  'state-change': 'stateChange',
  // A tab-owned scheduled command firing.
  'schedule-fire': 'scheduleFire',
  // An ACP session starting its first turn.
  'agent-start': 'agentStart',
  // An ACP query being rate limited by its provider.
  'rate-limited': 'rateLimited',
};

// Explicit reports bypass focus suppression so an action or failure on the active tab is not lost.
// Each event's reason for that classification is kept with its entry.
// Keyed by the union so every new event must be classified before it compiles.
export const EXPLICIT_EVENTS: Record<ExplicitNotificationEvent, true> = {
  // A scheduled command delivered more than five seconds late.
  'schedule-late': true,
  // A remote session ended on its own, rather than through a user action.
  'remote-session-terminated': true,
  // A remote-session action is recorded even after the sessions tab closes.
  'remote-session': true,
  // An unread harness idle badge escalated after remaining unread.
  'harness-idle': true,
  // The user explicitly sent `notify <message>`.
  manual: true,
  // A harness auto-approved one of its permission prompts.
  'auto-approve': true,
  // Auto-approval without a workspace can act on the user's real files.
  'auto-approve-no-workspace': true,
  // The app scheduled a harness resume after a subscription limit.
  'auto-resume': true,
  // An in-editor persona-suggestion query failed or returned no suggestion.
  'editor-suggest': true,
  // An agent is waiting for a human answer in a background tab.
  question: true,
  // A harness session record is missing, leaving only screen snapshots.
  'transcript-unavailable': true,
  // An SSH session recording was abandoned after a write failure.
  'ssh-recording-failed': true,
  // A harness session recording was abandoned after a write failure.
  'harness-recording-failed': true,
  // A shell session recording was abandoned after a write failure.
  'shell-recording-failed': true,
  // A shell's plain-text transcript was abandoned after a write failure.
  'shell-transcript-failed': true,
  // A browser for a `-b` tab is gone, so a new `connect()` cannot use it.
  'e2e-browser-gone': true,
  // A file-navigator copy, paste, move, delete, or undo/redo replay failed.
  'file-operation': true,
  // `open` found no opener; this also covers file-navigator activations without transcripts.
  'open-unsupported': true,
  // A tab-arrangement command could not carry out its target request.
  tab: true,
  // The host disabled a tab plugin after it broke.
  'plugin-failure': true,
  // A plugin used its notification capability to report its own line.
  'plugin-note': true,
  // A harness or agent launch was refused before it could open.
  'launch-refused': true,
  // A leftover workspace was removed so a launch could proceed.
  'launch-workspace-cleaned': true,
  // A remote launch cloned the missing project root after acceptance.
  'launch-root-cloned': true,
  // A remote host refused a request after the workspace was ready.
  'remote-refused': true,
  // A layout command could not resize, read bounds, or report a size.
  layout: true,
  // Project-owned schedule outcomes use their own default-on toggle below.
  'system-schedule-fire': true,
};

function isAmbient(event: NotificationEventType): event is AmbientNotificationEvent {
  return Object.hasOwn(AMBIENT_EVENTS, event);
}

// Whether an event should be recorded, given the config and the active tab. Defensive against the
// tab feeding itself. An explicit trigger always fires, subject only to the tab being open (enforced
// in `notify`), except project-owned system schedule notices, which have their own default-on toggle.
// Ambient events use their own toggle and are subject to focus suppression.
export function shouldNotify(
  config: NotificationConfig | undefined,
  event: NotificationEventType,
  tabLabel: string,
  activeLabel: string,
): boolean {
  if (tabLabel === NOTIFICATIONS_LABEL) return false;
  if (event === 'system-schedule-fire') return config?.events.systemScheduleFire ?? true;
  if (!isAmbient(event)) return EXPLICIT_EVENTS[event];
  if (tabLabel === activeLabel) return false;
  if (!config) return false;
  return config.events[AMBIENT_EVENTS[event]];
}

// The optional parts of a notification beyond its message, named so no caller spells out a run of
// `undefined`s to reach the one it needs.
export interface NotifyOptions {
  // A file the feed line opens when clicked.
  openFile?: string;
  // A tab the feed line focuses when clicked.
  openTab?: string;
  // When this event was actually detected. Genuinely optional rather than defaulting to now: a
  // caller that supplies one is reporting something it detected earlier — a remote harness's
  // auto-approve report, queued while detached and replayed on reattach — and such a notification
  // is dated in the feed and deliberately never toasted, since a toast carries no time.
  detectedAt?: Date;
}

// Record a notification for an event on `tabLabel`. The config + focus rules run first, via
// `shouldNotify`: an event they reject costs nothing, records nothing, and shows nothing, which is
// what keeps the ambient toggles a volume control rather than a way to fill the screen. An event
// they accept always reaches the queue and the record file; which surface shows it — the feed, a
// toast, or an escalation to the feed — is `deliverNotification`'s decision. `shouldNotify` has to be
// asked before any of that because it reads the active tab's label, which opening a tab changes.
//
// A label is an identity, not a name: a plugin tab's is derived from its prefix (`sql`, then `sql-2`)
// while the name its strip shows and its title carries is what the tab is about (`shop`). A line that
// leads with the label names neither the database a failure came from nor the file a suggestion
// failed on, so the header, the message and the toast lead with the name instead — the same
// `title ?? label` the tab strip uses. The label stays wherever it is the identity: the focus rule,
// the colour lookup, the record file's `tab`, and the pair a repeat folds on, so two `sql` tabs
// sharing a name still hold their own lines.
// `message` is the event-specific detail (see `notificationText`); everything rarer arrives by name
// in `options`, so the two link targets cannot be transposed.
export function notify(
  managers: Managers,
  event: NotificationEventType,
  tabLabel: string,
  message?: string,
  { openFile, openTab, detectedAt }: NotifyOptions = {},
): void {
  const activeLabel = managers.tab.cur().label;
  if (!shouldNotify(getConfig().notifications, event, tabLabel, activeLabel)) return;
  const tab = managers.tab.byLabel(tabLabel);
  const color = tab?.dotColor;
  const name = tab?.title ?? tabLabel;
  const recordedAt = new Date();
  const output = notificationText(event, name, message);
  deliverNotification(managers, {
    event,
    tabLabel,
    ...(name !== tabLabel && { tabName: name }),
    message: output,
    ...(color && { color }),
    entry: {
      input: '',
      output,
      // The dot label is the notification's provenance header — when, then who — so the line reads
      // `● 8:32pm janus: <message>`. `fromColor` (looked up from tabLabel) still colors the dot.
      from: `${provenanceTimestamp(detectedAt ?? recordedAt)} ${name}`,
      fromColor: color,
      ...(openFile && { openFiles: [openFile] }),
      ...(openTab && { openTab }),
    },
    detectedAt: detectedAt ?? recordedAt,
    recordedAt,
    ...(openFile && { openFile }),
    ...(openTab && { openTab }),
  }, detectedAt !== undefined);
}
