import type { ScreenCapture } from './screen.js';

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

export type BusyEntry = { classify: (capture: ScreenCapture) => BusyState };

// Per-harness busy/ready detectors, keyed by harness name (same shape as auto-approve's
// GATE_TABLE). A harness without an entry keeps today's coarse behavior — busy for the whole
// process lifetime. Signals were confirmed against claude 2.1.210, codex-cli 0.144.4, and
// opencode 1.17.18.
export const BUSY_TABLE: Record<string, BusyEntry> = {
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
