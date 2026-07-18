import type { ScreenCapture } from './screen.js';
import { detectPermissionGate, type HarnessAutoApprover } from './auto-approve.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

export type BusyState = 'busy' | 'ready';

// claude and codex both animate a Braille spinner glyph (U+2800–U+28FF) at the start of the OSC
// title while generating; an idle title leads with something else (claude's `✳`, codex's cwd
// basename). The leading glyph alone is the discriminator.
function leadsWithBraille(title: string): boolean {
  const code = title.codePointAt(0);
  return code !== undefined && code >= 0x28_00 && code <= 0x28_ff;
}

// Shared claude/codex title rule: leading Braille spinner glyph means busy, any other non-empty
// title means ready. Returns undefined when there is no usable title to classify.
function classifyTitle(title: string | undefined): BusyState | undefined {
  const trimmed = title?.trim();
  if (!trimmed) return undefined;
  return leadsWithBraille(trimmed) ? 'busy' : 'ready';
}

// claude's rendered-screen fallback for when no title is present: an `esc to interrupt` footer
// means it is still generating; otherwise a live input prompt box (a `❯` caret line that is not
// the permission gate's `❯ 1. Yes` option) means it is sitting at its own prompt.
function classifyClaudeScreen(text: string): BusyState {
  if (text.includes('esc to interrupt')) return 'busy';
  const promptBox = text.split('\n').some((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith('❯') && !trimmed.slice('❯'.length).trimStart().startsWith('1.');
  });
  return promptBox ? 'ready' : 'busy';
}

// opencode has no OSC-title state signal (its title is a static app/session name), so busy is
// recognized from the rendered frame: a progress-bar run of block/dot glyphs, or the interrupt
// hint footer (rendered `esc interrupt` in 1.17.18, `esc to interrupt` in earlier versions).
function classifyOpencodeScreen(text: string): BusyState {
  if (/[■⬝]{4}/.test(text)) return 'busy';
  if (text.includes('esc interrupt') || text.includes('esc to interrupt')) return 'busy';
  return 'ready';
}

type BusyEntry = { classify: (capture: ScreenCapture) => BusyState };

// Per-harness busy/ready detectors, keyed by harness name (same shape as auto-approve's
// GATE_TABLE). A harness without an entry keeps today's coarse behavior — busy for the whole
// process lifetime. Signals were confirmed against claude 2.1.210, codex-cli 0.144.4, and
// opencode 1.17.18.
const BUSY_TABLE: Record<string, BusyEntry> = {
  claude: {
    classify: (capture) => classifyTitle(capture.title) ?? classifyClaudeScreen(capture.text),
  },
  codex: {
    // codex emitted a title in every observed state; before the first title arrives, stay busy
    // (matching the busy-at-spawn initial state) rather than guessing from the screen.
    classify: (capture) => classifyTitle(capture.title) ?? 'busy',
  },
  opencode: {
    classify: (capture) => classifyOpencodeScreen(capture.text),
  },
};

// Classify a capture for `harnessName`, or undefined when the harness has no detector.
export function classifyBusy(capture: ScreenCapture, harnessName: string): BusyState | undefined {
  return BUSY_TABLE[harnessName]?.classify(capture);
}

// The tab facts a capture can change, flattened for change detection: the busy flag and the
// unread badge. `state: dirty` must fire only when one of them actually flips — captures land
// every ~1s while a harness is active, and most of them re-affirm the same state.
function dotSnapshot(managers: Managers, label: string): string {
  const unread = managers.tab.tabs.find((t) => t.label === label)?.hasUnread ?? false;
  return `${managers.tab.isBusy(label)}:${unread}`;
}

// Build the per-tab capture handler that keeps the tab's busy dot in sync with the harness's
// actual state, or undefined when the harness has no detector (leaving the coarse spawn-to-exit
// busy behavior untouched). A visible permission gate outranks the busy/ready signals: the
// harness is idle, blocked on the user, so busy clears immediately — and the tab is badged unread
// when nothing is going to answer the gate (`approver` missing, or stood down on it). A busy→ready
// transition is debounced to two consecutive ready captures so a brief mid-generation pause does
// not flicker the dot off; ready→busy is applied immediately. Whenever a capture flips the busy
// flag or the unread badge, `state: dirty` is emitted so clients see the change immediately —
// without it, a backgrounded tab's dot would sit stale until the next unrelated state push.
export function busyStatusHandler(
  name: string, label: string, managers: Managers, approver: HarnessAutoApprover | undefined,
): ((capture: ScreenCapture) => void) | undefined {
  const entry = BUSY_TABLE[name];
  if (!entry) return undefined;
  let pendingReady = false;
  const apply = (capture: ScreenCapture): void => {
    if (detectPermissionGate(capture.text, name)) {
      pendingReady = false;
      managers.tab.deleteBusy(label);
      if (!approver || approver.isStuck) managers.tab.markUnread(label);
      return;
    }
    const state = classifyBusy(capture, name);
    if (state === 'busy') {
      pendingReady = false;
      managers.tab.addBusy(label);
      return;
    }
    if (pendingReady) managers.tab.deleteBusy(label);
    else pendingReady = true;
  };
  return (capture) => {
    const before = dotSnapshot(managers, label);
    apply(capture);
    if (dotSnapshot(managers, label) !== before) messageBus.emit('state', { type: 'dirty' });
  };
}
