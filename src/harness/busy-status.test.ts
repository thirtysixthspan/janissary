import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { busyStatusHandler, BusyTracker } from './busy-status.js';
import { endsWithRecap, classifyBusy } from './busy-classify.js';
import { HarnessScreenReader, type ScreenCapture } from './screen.js';
import { HarnessAutoApprover } from './auto-approve.js';
import { HARNESS_IDLE_ESCALATION_MS, disposeHarnessIdleEscalations } from './idle-notification.js';
import { NotificationQueue } from '../notifications/queue.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import { clearUnreadTab, markUnreadTab } from '../tab/transcript/events.js';
import { makeTab } from '../tab/index.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { messageBus, type Subscription } from '../bus.js';

// Title fixtures from the live spot-checks (claude 2.1.210, codex-cli 0.144.4).
const CLAUDE_BUSY_TITLE = '⠂ Write a haiku about the sea';
const CLAUDE_IDLE_TITLE = '✳ Claude Code';
const CODEX_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const CODEX_IDLE_TITLE = 'scratchpad';
// claude 2.1.282 alternates two half-circle glyphs while working instead of a Braille spinner.
const CLAUDE_2_1_282_BUSY_TITLES = ['◐ Claude Code', '◑ Claude Code'];

const CLAUDE_PROMPT_BOX = [
  ' Some earlier output',
  '',
  ' ❯',
  '',
  ' ? for shortcuts',
].join('\n');

const CLAUDE_GENERATING = [
  ' ✻ Deliberating…',
  '',
  ' esc to interrupt',
].join('\n');

// Frames from the live opencode 1.17.18 spot-check: a progress bar while working, an
// `esc interrupt` footer (no "to"), and the idle input box with its command footer.
const OPENCODE_PROGRESS = 'Working on it\n⬝⬝⬝⬝■■■■\n';
const OPENCODE_INTERRUPT = 'Working on it\nesc interrupt\n';
const OPENCODE_IDLE = [
  ' > ',
  '',
  ' tab agents  ctrl+p commands',
].join('\n');

function capture(text: string, title?: string): ScreenCapture {
  return { text, capturedAt: Date.now(), title };
}

describe('classifyBusy — claude', () => {
  it('is busy when the title leads with a Braille spinner glyph', () => {
    expect(classifyBusy(capture('anything', CLAUDE_BUSY_TITLE), 'claude')).toBe('busy');
  });

  for (const title of CLAUDE_2_1_282_BUSY_TITLES) {
    it(`is busy when the title leads with claude 2.1.282's ${title.slice(0, 1)} spinner glyph`, () => {
      expect(classifyBusy(capture('anything', title), 'claude')).toBe('busy');
    });
  }

  it('is ready when the title leads with the ✳ idle marker', () => {
    expect(classifyBusy(capture('anything', CLAUDE_IDLE_TITLE), 'claude')).toBe('ready');
  });

  it('is ready for a live prompt box when no title is present', () => {
    expect(classifyBusy(capture(CLAUDE_PROMPT_BOX), 'claude')).toBe('ready');
  });

  it('is busy for a generating frame when no title is present', () => {
    expect(classifyBusy(capture(CLAUDE_GENERATING), 'claude')).toBe('busy');
  });

  it('does not read the gate\'s highlighted `❯ 1. Yes` option as a prompt box', () => {
    const gate = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No';
    expect(classifyBusy(capture(gate), 'claude')).toBe('busy');
  });
});

describe('classifyBusy — codex', () => {
  for (const frame of CODEX_SPINNER_FRAMES) {
    it(`is busy for the ${frame} spinner frame leading the title`, () => {
      expect(classifyBusy(capture('anything', `${frame} scratchpad`), 'codex')).toBe('busy');
    });
  }

  it('is ready for a non-Braille title such as the bare cwd basename', () => {
    expect(classifyBusy(capture('anything', CODEX_IDLE_TITLE), 'codex')).toBe('ready');
  });

  it('stays busy before any title has arrived', () => {
    expect(classifyBusy(capture('anything'), 'codex')).toBe('busy');
  });

  it('agrees with claude on the shared leading-spinner title rule', () => {
    for (const title of [CLAUDE_BUSY_TITLE, ...CLAUDE_2_1_282_BUSY_TITLES, `${CODEX_SPINNER_FRAMES[0]} scratchpad`, CLAUDE_IDLE_TITLE, CODEX_IDLE_TITLE]) {
      expect(classifyBusy(capture('anything', title), 'codex')).toBe(classifyBusy(capture('anything', title), 'claude'));
    }
  });
});

describe('classifyBusy — opencode', () => {
  it('is busy for a progress-bar run of block/dot glyphs', () => {
    expect(classifyBusy(capture(OPENCODE_PROGRESS), 'opencode')).toBe('busy');
  });

  it('is busy for the interrupt-hint footer', () => {
    expect(classifyBusy(capture(OPENCODE_INTERRUPT), 'opencode')).toBe('busy');
  });

  it('is ready for the idle input-box frame', () => {
    expect(classifyBusy(capture(OPENCODE_IDLE), 'opencode')).toBe('ready');
  });

  it('ignores the static OpenCode title entirely', () => {
    expect(classifyBusy(capture(OPENCODE_PROGRESS, 'OpenCode'), 'opencode')).toBe('busy');
    expect(classifyBusy(capture(OPENCODE_IDLE, 'OpenCode'), 'opencode')).toBe('ready');
  });
});

describe('classifyBusy — unknown harness', () => {
  it('returns undefined regardless of input', () => {
    expect(classifyBusy(capture(OPENCODE_PROGRESS, CLAUDE_BUSY_TITLE), 'mystery')).toBeUndefined();
    expect(classifyBusy(capture(CLAUDE_PROMPT_BOX, CLAUDE_IDLE_TITLE), 'mystery')).toBeUndefined();
  });
});

const CLAUDE_RECAP_PROMPT_BOX = [
  ' recap: fixed the thing',
  '',
  ' ❯',
  '',
  ' ? for shortcuts',
].join('\n');

describe('endsWithRecap', () => {
  it('is true when the last content line above the prompt is recap:-prefixed', () => {
    expect(endsWithRecap(CLAUDE_RECAP_PROMPT_BOX)).toBe(true);
  });

  it('is true case-insensitively', () => {
    expect(endsWithRecap(' Recap: done\n\n ❯\n')).toBe(true);
    expect(endsWithRecap(' RECAP: done\n\n ❯\n')).toBe(true);
  });

  it('is false when the last content line is ordinary completion text', () => {
    expect(endsWithRecap(CLAUDE_PROMPT_BOX)).toBe(false);
  });

  it('is false for a generating frame with no prompt box present', () => {
    expect(endsWithRecap(CLAUDE_GENERATING)).toBe(false);
  });
});

// The far side's counterpart of `busyStatusHandler` reuses this class directly — see
// `src/remote/serve-processes-detect.ts` — so its own behavior is covered here independent of the
// `Managers`-backed wrapper, and `busyStatusHandler`'s tests below exercise the same logic again
// through that wrapper's surface.
describe('BusyTracker', () => {
  it('starts busy, matching a freshly spawned tab\'s initial busy state', () => {
    expect(new BusyTracker().current()).toBe(true);
  });

  it('reports a gate as not-busy with unread following the `stuck` flag it is given', () => {
    const gate = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No';
    expect(new BusyTracker().observe(capture(gate), 'claude', true)).toEqual({ busy: false, unread: true });
    expect(new BusyTracker().observe(capture(gate), 'claude', false)).toEqual({ busy: false, unread: false });
  });

  it('reports busy immediately and updates current()', () => {
    const tracker = new BusyTracker();
    expect(tracker.observe(capture('anything', CLAUDE_BUSY_TITLE), 'claude', false)).toEqual({ busy: true, unread: false });
    expect(tracker.current()).toBe(true);
  });

  it('suppresses a repeated busy decision', () => {
    const tracker = new BusyTracker();
    expect(tracker.observe(capture('anything', CLAUDE_BUSY_TITLE), 'claude', false)).toEqual({ busy: true, unread: false });
    expect(tracker.observe(capture('anything', CLAUDE_BUSY_TITLE), 'claude', false)).toBeUndefined();
  });

  it('debounces ready to two consecutive captures before reporting it, then updates current()', () => {
    const tracker = new BusyTracker();
    tracker.observe(capture('anything', CLAUDE_BUSY_TITLE), 'claude', false);
    expect(tracker.observe(capture('anything', CLAUDE_IDLE_TITLE), 'claude', false)).toBeUndefined();
    expect(tracker.current()).toBe(true);
    expect(tracker.observe(capture('anything', CLAUDE_IDLE_TITLE), 'claude', false)).toEqual({ busy: false, unread: true });
    expect(tracker.current()).toBe(false);
  });

  it('resets its reported baseline to a snapshot, so a later decision equal to one from before the snapshot is reported again', () => {
    const tracker = new BusyTracker();
    tracker.observe(capture('anything', CLAUDE_BUSY_TITLE), 'claude', false);
    tracker.observe(capture(CLAUDE_PROMPT_BOX), 'claude', false);
    expect(tracker.observe(capture(CLAUDE_PROMPT_BOX), 'claude', true)).toEqual({ busy: false, unread: true });
    // A caller (an attach) sends { busy: false, unread: false } on the tracker's behalf, without
    // an observe() call — the tracker must treat that as what was actually reported from now on.
    expect(tracker.snapshot()).toEqual({ busy: false, unread: false });
    tracker.observe(capture('anything', CLAUDE_BUSY_TITLE), 'claude', false);
    tracker.observe(capture(CLAUDE_PROMPT_BOX), 'claude', false);
    // The same { busy: false, unread: true } decision as before the snapshot recurs. Without the
    // snapshot resetting `reported`, this would be wrongly suppressed as a repeat of the pre-attach
    // decision the client was never actually sent.
    expect(tracker.observe(capture(CLAUDE_PROMPT_BOX), 'claude', true)).toEqual({ busy: false, unread: true });
  });

  it('exempts a claude recap from unread on the ready transition, matching busyStatusHandler', () => {
    const tracker = new BusyTracker();
    tracker.observe(capture('anything', CLAUDE_BUSY_TITLE), 'claude', false);
    tracker.observe(capture(CLAUDE_RECAP_PROMPT_BOX), 'claude', false);
    expect(tracker.observe(capture(CLAUDE_RECAP_PROMPT_BOX), 'claude', false)).toEqual({ busy: false, unread: false });
  });
});

describe('busyStatusHandler debounce', () => {
  function make(name: string) {
    const busy = new Set<string>();
    const tabList = [{ label: name, hasUnread: false }];
    const tab = {
      tabs: tabList,
      byLabel: (label: string) => tabList.find((t) => t.label === label),
      isBusy: (label: string) => busy.has(label),
      addBusy: vi.fn((label: string) => { busy.add(label); }),
      deleteBusy: vi.fn((label: string) => { busy.delete(label); }),
      markUnread: vi.fn(),
      clearUnread: vi.fn(),
    };
    const handler = busyStatusHandler(name, name, { tab } as unknown as Managers, undefined);
    if (!handler) throw new Error(`no busy entry for ${name}`);
    return { tab, handler };
  }

  const cases = [
    { name: 'claude', busy: capture('anything', CLAUDE_BUSY_TITLE), ready: capture('anything', CLAUDE_IDLE_TITLE) },
    { name: 'codex', busy: capture('anything', '⠹ scratchpad'), ready: capture('anything', CODEX_IDLE_TITLE) },
    { name: 'opencode', busy: capture(OPENCODE_PROGRESS), ready: capture(OPENCODE_IDLE) },
  ];

  for (const { name, busy, ready } of cases) {
    it(`${name}: a single transient ready capture between two busy captures does not clear busy`, () => {
      const { tab, handler } = make(name);
      handler(busy);
      handler(ready);
      handler(busy);
      expect(tab.deleteBusy).not.toHaveBeenCalled();
      expect(tab.addBusy).toHaveBeenCalledOnce();
    });

    it(`${name}: two consecutive ready captures clear busy`, () => {
      const { tab, handler } = make(name);
      handler(busy);
      handler(ready);
      handler(ready);
      expect(tab.deleteBusy).toHaveBeenCalledTimes(1);
    });

    it(`${name}: calls markUnread only once the ready transition commits, not on the first transient ready`, () => {
      const { tab, handler } = make(name);
      handler(busy);
      handler(ready);
      expect(tab.markUnread).not.toHaveBeenCalled();
      handler(ready);
      expect(tab.markUnread).toHaveBeenCalledTimes(1);
    });
  }

  it('claude 2.1.282: an idle tab starts blinking again when the title spinner resumes', () => {
    const { tab, handler } = make('claude');
    handler(capture(CLAUDE_PROMPT_BOX, CLAUDE_IDLE_TITLE));
    handler(capture(CLAUDE_PROMPT_BOX, CLAUDE_IDLE_TITLE));
    expect(tab.isBusy('claude')).toBe(false);
    handler(capture(CLAUDE_GENERATING, CLAUDE_2_1_282_BUSY_TITLES[0]));
    expect(tab.isBusy('claude')).toBe(true);
    handler(capture(CLAUDE_GENERATING, CLAUDE_2_1_282_BUSY_TITLES[1]));
    expect(tab.isBusy('claude')).toBe(true);
  });

  it('claude 2.1.282: a turn that ends in one burst and then goes quiet commits idle through the settle capture', async () => {
    vi.useFakeTimers();
    try {
      const { tab, handler } = make('claude');
      const reader = new HarnessScreenReader('pty-claude-quiet', 120, 10, handler);
      const emit = (data: string) => { messageBus.emit('pty', { type: 'data', id: 'pty-claude-quiet', data }); };
      emit(`\u{1B}]0;${CLAUDE_2_1_282_BUSY_TITLES[0]}\u{7}${CLAUDE_GENERATING.replaceAll('\n', '\r\n')}`);
      await vi.advanceTimersByTimeAsync(900);
      emit(`\u{1B}]0;${CLAUDE_2_1_282_BUSY_TITLES[1]}\u{7}`);
      await vi.advanceTimersByTimeAsync(900);
      expect(tab.isBusy('claude')).toBe(true);
      emit(`\u{1B}]0;${CLAUDE_IDLE_TITLE}\u{7}\u{1B}[2J\u{1B}[H${CLAUDE_PROMPT_BOX.replaceAll('\n', '\r\n')}`);
      await vi.advanceTimersByTimeAsync(1100);
      expect(tab.isBusy('claude')).toBe(true);
      await vi.advanceTimersByTimeAsync(1100);
      expect(tab.isBusy('claude')).toBe(false);
      expect(tab.deleteBusy).toHaveBeenCalledTimes(1);
      reader.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns undefined for a harness with no table entry', () => {
    const tab = { addBusy: vi.fn(), deleteBusy: vi.fn(), markUnread: vi.fn() };
    expect(busyStatusHandler('mystery', 'mystery', { tab } as unknown as Managers, undefined)).toBeUndefined();
  });

  it('claude: does not badge the tab unread when the ready transition\'s last line is a recap', () => {
    const { tab, handler } = make('claude');
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    handler(capture(CLAUDE_RECAP_PROMPT_BOX));
    handler(capture(CLAUDE_RECAP_PROMPT_BOX));
    expect(tab.deleteBusy).toHaveBeenCalledTimes(1);
    expect(tab.markUnread).not.toHaveBeenCalled();
  });

  it('claude: still badges unread for an ordinary (non-recap) ready transition', () => {
    const { tab, handler } = make('claude');
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    handler(capture(CLAUDE_PROMPT_BOX));
    handler(capture(CLAUDE_PROMPT_BOX));
    expect(tab.markUnread).toHaveBeenCalledTimes(1);
  });

  it('codex/opencode: a recap-shaped last line does not suppress markUnread (claude-only exemption)', () => {
    const opencodeRecap = capture('recap: fixed the thing\n > \n');
    const { tab, handler } = make('opencode');
    handler(capture(OPENCODE_PROGRESS));
    handler(opencodeRecap);
    handler(opencodeRecap);
    expect(tab.markUnread).toHaveBeenCalledTimes(1);
  });
});

describe('busyStatusHandler state push', () => {
  function makeStateful(name: string, autoApprove = false) {
    const busy = new Set<string>();
    const tabs = [{ label: name, hasUnread: false }];
    const tab = {
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      isBusy: (label: string) => busy.has(label),
      addBusy: (label: string) => { busy.add(label); },
      deleteBusy: (label: string) => { busy.delete(label); },
      markUnread: () => { tabs[0].hasUnread = true; },
      clearUnread: () => { tabs[0].hasUnread = false; },
    };
    const approver = autoApprove
      ? new HarnessAutoApprover({ harnessName: name, approve: vi.fn(), notify: vi.fn() })
      : undefined;
    const busyHandler = busyStatusHandler(name, name, { tab } as unknown as Managers, approver);
    if (!busyHandler) throw new Error(`no busy entry for ${name}`);
    const handler = (next: ScreenCapture) => {
      approver?.onCapture(next);
      busyHandler(next);
    };
    return { tabs, handler };
  }

  let dirtyCount = 0;
  let subscription: Subscription;

  beforeEach(() => {
    dirtyCount = 0;
    subscription = messageBus.on('state', 'dirty', () => { dirtyCount += 1; });
  });

  afterEach(() => { subscription.unsubscribe(); });

  it('pushes state when the harness turns busy', () => {
    const { handler } = makeStateful('claude');
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    expect(dirtyCount).toBe(1);
  });

  it('pushes state when the debounced ready transition commits', () => {
    const { handler } = makeStateful('claude');
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    handler(capture('anything', CLAUDE_IDLE_TITLE));
    expect(dirtyCount).toBe(1);
    handler(capture('anything', CLAUDE_IDLE_TITLE));
    expect(dirtyCount).toBe(2);
  });

  it('does not push again while captures keep the same state', () => {
    const { handler } = makeStateful('claude');
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    expect(dirtyCount).toBe(1);
  });

  it('pushes state when a permission gate badges the tab unread', () => {
    const { tabs, handler } = makeStateful('claude');
    const gate = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No';
    handler(capture(gate));
    expect(tabs[0].hasUnread).toBe(true);
    expect(dirtyCount).toBe(1);
  });

  it('clears a gate\'s unread badge once the harness resumes work after the prompt is answered', () => {
    const { tabs, handler } = makeStateful('claude');
    const gate = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No';
    handler(capture(gate));
    expect(tabs[0].hasUnread).toBe(true);
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    expect(tabs[0].hasUnread).toBe(false);
    expect(dirtyCount).toBe(2);
  });

  it('clears an auto-approved gate\'s unread badge once the harness resumes work', () => {
    const { tabs, handler } = makeStateful('claude', true);
    const gate = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No';
    handler(capture(gate));
    expect(tabs[0].hasUnread).toBe(false);
    handler(capture(gate));
    expect(tabs[0].hasUnread).toBe(true);
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    expect(tabs[0].hasUnread).toBe(false);
  });

  it('badges the tab unread when the debounced ready transition commits', () => {
    const { tabs, handler } = makeStateful('claude');
    handler(capture('anything', CLAUDE_BUSY_TITLE));
    handler(capture('anything', CLAUDE_IDLE_TITLE));
    expect(tabs[0].hasUnread).toBe(false);
    handler(capture('anything', CLAUDE_IDLE_TITLE));
    expect(tabs[0].hasUnread).toBe(true);
  });
});

// The escalation is armed from `applyBusyTransition` — the one place a local capture and a remote
// harness's reported transition both arrive — and only when the badge was genuinely raised. These
// drive real captures through the real handler with the real notification path behind it, which is
// the only place the two halves meet.
describe('busyStatusHandler idle escalation', () => {
  const GATE = ' Do you want to proceed?\n ❯ 1. Yes\n   2. No';

  function make(name = 'claude', autoApprove = false) {
    vi.useFakeTimers();
    const janus = makeTab('janus', '#abc');
    const harness = makeTab(name, '#def');
    const tabs: Tab[] = [janus, harness];
    let activeIndex = 0;
    const busyLabels = new Set<string>();
    const approver = autoApprove
      ? new HarnessAutoApprover({ harnessName: name, approve: vi.fn(), notify: vi.fn() })
      : undefined;
    const managers = {
      tab: {
        // The host fixture's own `markUnread` is inert; this one has to be real, because whether the
        // badge went up is exactly what decides whether an escalation is armed.
        ...fakeNotificationsHost(tabs),
        tabs,
        byLabel: (l: string) => tabs.find((t) => t.label === l),
        cur: () => tabs[activeIndex],
        append: vi.fn(),
        isBusy: (l: string) => busyLabels.has(l),
        addBusy: (l: string) => { busyLabels.add(l); },
        deleteBusy: (l: string) => { busyLabels.delete(l); },
        markUnread: (l: string) => markUnreadTab(tabs, l, tabs[activeIndex].label),
        clearUnread: (l: string) => { clearUnreadTab(tabs, l); },
      },
      notifications: new NotificationQueue(),
    } as unknown as Managers;
    const busy = busyStatusHandler(name, name, managers, approver);
    if (!busy) throw new Error(`no busy entry for ${name}`);
    const handler = (next: ScreenCapture) => {
      approver?.onCapture(next);
      busy(next);
    };
    const messages = () => managers.notifications.all.map((n) => n.message);
    return { handler, harness, janus, managers, messages, tabs, makeActive: (i: number) => { activeIndex = i; } };
  }

  // No `messageBus.clear()` here: this file imports `idle-notification.js`, whose
  // `tabs: unread-cleared` subscription is registered at module scope, and clearing the bus would
  // drop it from the second case onward — leaving the cancel cases below unexercised while still
  // passing, through the fire-time backstop.
  afterEach(() => {
    disposeHarnessIdleEscalations();
    vi.useRealTimers();
  });

  it('notifies a hidden tab 30s after the debounced ready transition commits, and not before', () => {
    const fixture = make();
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    expect(fixture.messages()).toEqual([]);

    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS - 1);
    expect(fixture.messages()).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(fixture.messages()).toEqual(["Agent 'claude' is waiting"]);
  });

  it('arms nothing for the first transient ready capture that only starts the debounce', () => {
    const fixture = make();
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));

    vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
    expect(fixture.messages()).toEqual([]);
  });

  it('arms for an unanswered permission gate, which stops the dot without the debounce', () => {
    const fixture = make();
    fixture.handler(capture(GATE));

    vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS);
    expect(fixture.messages()).toEqual(["Agent 'claude' is waiting"]);
  });

  it('arms for nothing on a tab the user is looking at', () => {
    const fixture = make();
    fixture.makeActive(1);
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    expect(fixture.harness.hasUnread).toBeUndefined();

    vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
    expect(fixture.messages()).toEqual([]);
  });

  it('arms for nothing on a claude recap, which is badged-exempt', () => {
    const fixture = make();
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));
    fixture.handler(capture(CLAUDE_RECAP_PROMPT_BOX));
    fixture.handler(capture(CLAUDE_RECAP_PROMPT_BOX));
    expect(fixture.harness.hasUnread).toBeUndefined();

    vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
    expect(fixture.messages()).toEqual([]);
  });

  it('cancels when the harness goes back to work', () => {
    const fixture = make();
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));

    vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
    expect(fixture.messages()).toEqual([]);
  });

  // The case above passes either way: with the badge down, the fire-time check discards the
  // escalation whether or not anything cancelled it. Re-raising the badge behind that check's back
  // leaves the `tabs: unread-cleared` subscription as the only thing that can stop it, so this fails
  // if that listener is gone.
  it('cancels on the badge-clear signal even when the badge comes back', () => {
    const fixture = make();
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));
    // Deliberate, not a setup slip: the escalation must not be rescued by the badge being back.
    fixture.harness.hasUnread = true;

    vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
    expect(fixture.messages()).toEqual([]);
  });

  it('cancels when the tab is dwelt on and the badge comes off', () => {
    const fixture = make();
    fixture.handler(capture('anything', CLAUDE_BUSY_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    fixture.handler(capture('anything', CLAUDE_IDLE_TITLE));
    expect(fixture.harness.hasUnread).toBe(true);

    // What a completed unread dwell does, three seconds after the user goes to the tab.
    clearUnreadTab(fixture.tabs ?? [], 'claude');
    vi.advanceTimersByTime(HARNESS_IDLE_ESCALATION_MS * 2);
    expect(fixture.messages()).toEqual([]);
  });
});
