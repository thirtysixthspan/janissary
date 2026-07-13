import type { ScreenCapture } from './screen.js';

// How far up from the bottom of the capture the gate menu is allowed to sit. The real permission
// menu always occupies the final few lines; requiring both anchors inside this window rejects the
// classic false positive of a session merely *printing* gate-shaped text that has scrolled upward.
const GATE_WINDOW_LINES = 10;

// The highlighted default option-1 line, e.g. `❯ 1. Yes` (possibly with trailing text). The `❯`
// glyph is the highlight marker and is required — a gate always defaults to "Yes".
function isYesDefaultLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('❯')) return false;
  const afterMarker = trimmed.slice('❯'.length).trimStart();
  if (!afterMarker.startsWith('1.')) return false;
  return afterMarker.slice('1.'.length).trimStart().startsWith('Yes');
}

// A `No` option line, numbered `2.` (two-option gates) or `3.` (three-option gates), tolerating a
// missing space after the number (the MCP capture rendered `2.Yes` with no space).
function isNoOptionLine(line: string): boolean {
  const trimmed = line.trim();
  if (!(trimmed.startsWith('2.') || trimmed.startsWith('3.'))) return false;
  return trimmed.slice('2.'.length).trimStart().startsWith('No');
}

// claude's permission gate, matched on menu *structure* rather than the (variable) question,
// footer, or option wording: within the last few lines, a highlighted `❯ 1. Yes` line followed by
// a later `2. No`/`3. No` line. Deterministic, so false positives stay near-zero.
function detectClaudeGate(text: string): boolean {
  const window = text.split('\n').slice(-GATE_WINDOW_LINES);
  const yesIndex = window.findIndex((line) => isYesDefaultLine(line));
  if (yesIndex === -1) return false;
  return window.slice(yesIndex + 1).some((line) => isNoOptionLine(line));
}

type GateEntry = { detect: (text: string) => boolean; keystroke: string };

// Per-harness gate detectors + approval keystrokes. Only claude is populated today; opencode/codex
// are deliberate later work (each needs its own captured gate signatures). claude's keystroke is
// Enter (`\r`), which accepts the highlighted default "Yes" across every captured variant — `y`
// does not work because these are numbered menus, not y/n prompts.
const GATE_TABLE: Record<string, GateEntry> = {
  claude: { detect: detectClaudeGate, keystroke: '\r' },
};

// Whether the rendered screen `text` is a recognized permission gate for `harnessName`. Pure and
// deterministic; any harness without a table entry returns false.
export function detectPermissionGate(text: string, harnessName: string): boolean {
  const entry = GATE_TABLE[harnessName];
  return entry ? entry.detect(text) : false;
}

// Watches a harness's screen captures and injects the approval keystroke when a permission gate is
// detected, then reports it. A loop guard prevents re-injecting into an identical, uncleared gate.
export class HarnessAutoApprover {
  private lastApprovedText: string | undefined;
  private stuckNotified = false;
  private keystroke: string;

  constructor(private opts: {
    harnessName: string;
    approve: (keystroke: string) => void;
    notify: (message: string) => void;
  }) {
    this.keystroke = GATE_TABLE[opts.harnessName]?.keystroke ?? '\r';
  }

  onCapture(capture: ScreenCapture): void {
    if (!detectPermissionGate(capture.text, this.opts.harnessName)) {
      this.lastApprovedText = undefined;
      this.stuckNotified = false;
      return;
    }
    if (capture.text === this.lastApprovedText) {
      if (!this.stuckNotified) {
        this.stuckNotified = true;
        this.opts.notify('Auto-approve could not clear the permission prompt; standing down');
      }
      return;
    }
    this.opts.approve(this.keystroke);
    this.lastApprovedText = capture.text;
    this.stuckNotified = false;
    this.opts.notify('Auto-approved a permission prompt');
  }
}
