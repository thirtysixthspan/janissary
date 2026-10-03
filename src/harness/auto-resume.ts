import type { ScreenCapture } from './screen.js';
import { HARNESS_NAMES } from './index.js';
import { parseInterval, parseMonthDay, parseTimeOfDay } from '../schedule/parsing.js';
import { fmtTime } from '../schedule/display.js';
import type { ScheduleEntry, TimeOfDay } from '../schedule/types.js';

// How long after the stated reset the resume is typed in. The reset a harness names is the earliest
// moment it will take work again, so the resume waits for it rather than racing it.
export const RESUME_MARGIN_MS = 60_000;

// The trailing rows a limit screen is read from. Three because the recognized message wraps across
// two, and because a message the harness later quotes in its scrollback has anything the harness
// printed since below it and is history, not a live blockage.
const LIMIT_WINDOW_ROWS = 3;

// How far ahead a stated duration is trusted. Matching what claude itself will wait for before it
// hands the decision back to the user; a larger number is more likely a misparse than a real wait.
const MAX_RELATIVE_MS = 24 * 60 * 60 * 1000;

// What the harness said it would accept work again at, as printed. `at` is a clock time today or
// tomorrow, `on` a calendar date (a weekly window), `in` a duration from now.
export type ResumeReset =
  | { kind: 'at'; time: TimeOfDay }
  | { kind: 'on'; month: number; day: number; time: TimeOfDay }
  | { kind: 'in'; ms: number };

// codex's usage-limit banner: the limit wording, then the reset clause it ends with. The clause
// runs to the next sentence break, so the surrounding upgrade/purchase links and the trailing full
// stop never reach the parsers. Anchored on "hit your usage limit" rather than the "You've" in front
// of it, which is what lets a typographic apostrophe match without the pattern caring which one
// codex printed.
const LIMIT_PATTERN = /hit your usage limit[^]{0,200}?try again (at|in) ([^.;]+)/i;

// One `N<unit>` token of a stated duration, e.g. `4 days` or `23h`.
const DURATION_TOKEN = /(\d+)\s*(m|h|d|w)/gi;

// The reset clause as `ResumeReset`, or undefined when it is a form the app will not trust. The
// clause's first character picks the arm: a letter means a dated reset, a digit a clock time.
// Commas are dropped first, because the banner separates an ordinal from its year with one
// (`Jul 8th, 2026 10:59 AM`) and the parsers below read bare tokens.
function parseResetClause(keyword: string, clause: string): ResumeReset | undefined {
  const tokens = clause.replaceAll(',', ' ').trim().split(/\s+/).filter((token) => token !== '');
  if (keyword.toLowerCase() === 'in') return relativeReset(clause);
  if (/^[a-z]/i.test(tokens[0] ?? '')) {
    const date = parseMonthDay(tokens);
    if (!date) return undefined;
    const rest = tokens.slice(date.consumed);
    if (/^\d{4}$/.test(rest[0] ?? '')) rest.shift();
    if (rest[0]?.toLowerCase() === 'at') rest.shift();
    const time = parseTimeOfDay(rest.join(' '));
    return time ? { kind: 'on', month: date.month, day: date.day, time } : undefined;
  }
  const time = parseTimeOfDay(tokens.join(' '));
  return time ? { kind: 'at', time } : undefined;
}

// A stated duration, its tokens summed through the scheduler's own interval parser. Longer than the
// ceiling, or carrying a token it cannot read, and the app does not schedule anything.
function relativeReset(clause: string): ResumeReset | undefined {
  let ms = 0;
  let tokens = 0;
  for (const match of clause.matchAll(DURATION_TOKEN)) {
    const interval = parseInterval(`${match[1]}${match[2]}`);
    if (interval === undefined) return undefined;
    ms += interval;
    tokens++;
  }
  return tokens > 0 && ms <= MAX_RELATIVE_MS ? { kind: 'in', ms } : undefined;
}

// The reset codex's limit screen states, or undefined when the screen is not one, states no reset,
// or states one the app will not trust. Pure and deterministic; any harness without a table entry
// returns undefined.
export function detectResumeLimit(text: string, harnessName: string): ResumeReset | undefined {
  const entry = RESUME_TABLE[harnessName];
  if (!entry) return undefined;
  const rows = text.split('\n').filter((row) => row.trim() !== '');
  const match = entry.pattern.exec(rows.slice(-LIMIT_WINDOW_ROWS).join(' ').replaceAll(/\s+/g, ' '));
  return match ? parseResetClause(match[1], match[2]) : undefined;
}

// When the resume is due for a stated `reset`: the reset itself plus the margin, or — when the
// reset is already behind us — the margin from now. codex prints its reset time without seconds, so
// a limit hit at 7:36:15 against a reset at 7:36:40 states a time that has already gone; reading it
// as tomorrow's would park the tab for a day.
export function resumeInstant(reset: ResumeReset, now: Date): number {
  return Math.max(dateAt(reset, now), now.getTime()) + RESUME_MARGIN_MS;
}

// The instant the reset names, on this year for a dated one. Deliberately not
// `nextOccurrenceOfTime`/`nextDateTime`: both roll a past value forward a whole day or a whole year,
// which is the day-late and year-late failure this rule exists to avoid.
function dateAt(reset: ResumeReset, now: Date): number {
  if (reset.kind === 'in') return now.getTime() + reset.ms;
  const date = new Date(now);
  date.setMonth(reset.kind === 'on' ? reset.month : date.getMonth(), reset.kind === 'on' ? reset.day : date.getDate());
  date.setHours(reset.time.hour, reset.time.minute, 0, 0);
  return date.getTime();
}

type ResumeEntry = { pattern: RegExp };

// Per-harness limit-screen detectors, one per bundled harness whose limit states a reset the app
// can act on. Membership here is also the source of truth for which harnesses accept
// `--auto-resume` (see supportsHarnessAutoResume) and which ones the launch dialog offers it for.
// claude is absent because it resumes itself (`autoContinueAtUsageLimit`); opencode is absent
// because it prints no limit at all when one hits — it hangs mid-generation.
const RESUME_TABLE: Record<string, ResumeEntry> = {
  codex: { pattern: LIMIT_PATTERN },
};

// Whether `harnessName` has an installed limit-screen detector and therefore supports auto-resume.
// Command parsing derives its accepted set from this predicate, so validation cannot drift from the
// detectors that actually exist.
export function supportsHarnessAutoResume(harnessName: string): boolean {
  return RESUME_TABLE[harnessName] !== undefined;
}

// Every harness that supports auto-resume, in catalog order — delivered to the launch dialog so it
// offers the checkbox for exactly the harnesses the command parser accepts `--auto-resume` for.
export function autoResumeHarnessNames(): string[] {
  return HARNESS_NAMES.filter((name) => supportsHarnessAutoResume(name));
}

// The auto-resume harnesses as prose ("codex"), for the refusal that names them.
export function describeAutoResumeHarnesses(): string {
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(autoResumeHarnessNames());
}

// The prompt typed into a harness whose limit has reset. The harness has no way to know it was
// interrupted, so it is told plainly: the limit is over, pick the task back up.
export const RESUME_PROMPT = 'resume the task you were working on.';

// The id the resume carries in the tab's schedule, so it reads as its own timer and
// `schedule cancel auto-resume` reaches it.
export const RESUME_ENTRY_ID = 'auto-resume';

// The one-shot entry a scheduled resume is delivered as, for the local wiring and a remote session's
// replayed report alike. Its `spec` reads as a hand-written `at` timer.
export function resumeEntry(resumeAt: number): ScheduleEntry {
  const date = new Date(resumeAt);
  const clock: TimeOfDay = { hour: date.getHours(), minute: date.getMinutes() };
  return {
    id: RESUME_ENTRY_ID,
    command: RESUME_PROMPT,
    spec: `at ${fmtTime(clock)}`,
    nextRun: resumeAt,
    recurring: false,
  };
}

export type ResumeObserverOptions = {
  harnessName: string;
  // Append the one-shot resume to the tab's schedule, returning its id.
  schedule: (resumeAt: number) => string;
  // Drop a pending resume, for a blockage that cleared before it was due.
  cancel: () => void;
  // Report a scheduled resume: the reset the harness stated, the instant it resolves to, and the
  // screen that carried it.
  onScheduled: (reset: ResumeReset, resumeAt: number, capture: ScreenCapture) => void;
  // Report that the resume was delivered.
  onDelivered: () => void;
};

// Watches a harness's screen captures and schedules one resume for the limit it recognizes. The
// parked window — a blockage acted on, up to the screen changing — is what busy/ready tracking is
// told about, so a tab the app is about to recover on its own neither blinks nor badges.
export class HarnessAutoResumer {
  private lastText: string | undefined;
  private actedAt: number | undefined;
  private pendingId: string | undefined;

  constructor(private opts: ResumeObserverOptions) {}

  // Whether this tab is parked on a resume the app has already scheduled.
  get isParked(): boolean { return this.actedAt !== undefined; }

  onCapture(capture: ScreenCapture): void {
    if (!supportsHarnessAutoResume(this.opts.harnessName)) return;
    if (capture.text === this.lastText) return;
    this.lastText = capture.text;
    const reset = detectResumeLimit(capture.text, this.opts.harnessName);
    if (!reset) {
      this.actedAt = undefined;
      if (this.pendingId !== undefined) {
        this.pendingId = undefined;
        this.opts.cancel();
      }
      return;
    }
    const resumeAt = resumeInstant(reset, new Date());
    if (this.actedAt === resumeAt) return;
    this.actedAt = resumeAt;
    this.pendingId = this.opts.schedule(resumeAt);
    this.opts.onScheduled(reset, resumeAt, capture);
  }

  // The resume was delivered and its entry is gone from the tab's schedule.
  onDelivered(): void {
    if (this.pendingId === undefined) return;
    this.pendingId = undefined;
    this.opts.onDelivered();
  }
}