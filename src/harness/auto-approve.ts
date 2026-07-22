import type { ScreenCapture } from './screen.js';
import { detectCodexPermissionGate, CODEX_APPROVAL_KEYSTROKE } from './codex-permission-gate.js';

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

// claude's live input caret — the `❯` prompt of its own input box, as distinct from the gate's
// highlighted `❯ 1. Yes` option (which starts with `1.`). An active gate replaces the input box, so
// the caret is absent; its reappearance below the options means the gate is gone — dismissed, or
// gate-shaped text that has scrolled up while claude sits back at its prompt. Mirrors the
// prompt-box signal in busy-classify.
function isInputCaretLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('❯')) return false;
  return !trimmed.slice('❯'.length).trimStart().startsWith('1.');
}

// claude's permission gate, matched on menu *structure* rather than the (variable) question,
// footer, or option wording: a highlighted `❯ 1. Yes` line followed by a later `2. No`/`3. No`
// line, with no live input caret beneath the options. Keying on what follows the options — rather
// than their distance from the bottom — lets the gate be detected regardless of the passive chrome
// claude pins below it (the footer hint, a task panel, status lines), while still rejecting
// gate-shaped text that has scrolled up and been superseded by claude's own prompt.
function detectClaudeGate(text: string): boolean {
  const lines = text.split('\n');
  const yesIndex = lines.findIndex((line) => isYesDefaultLine(line));
  if (yesIndex === -1) return false;
  const noIndex = lines.findIndex((line, i) => i > yesIndex && isNoOptionLine(line));
  if (noIndex === -1) return false;
  return lines.slice(noIndex + 1).every((line) => !isInputCaretLine(line));
}

type GateEntry = { detect: (text: string) => boolean; keystroke: string };

// Per-harness gate detectors + approval keystrokes. claude and codex are populated; opencode is
// deliberate later work (it needs its own captured gate signatures). Both keystrokes are Enter
// (`\r`), which accepts the highlighted default option — `y` does not work because these are
// selected-row menus, not y/n prompts. Membership here is also the source of truth for which
// harnesses accept `-y`/auto-approve (see supportsHarnessAutoApprove).
const GATE_TABLE: Record<string, GateEntry> = {
  claude: { detect: detectClaudeGate, keystroke: '\r' },
  codex: { detect: detectCodexPermissionGate, keystroke: CODEX_APPROVAL_KEYSTROKE },
};

// Whether `harnessName` has an installed permission-gate detector and therefore supports
// auto-approve (`-y`). Command parsing and profile launching both derive their accepted set from
// this predicate, so validation cannot drift from the detectors that actually exist.
export function supportsHarnessAutoApprove(harnessName: string): boolean {
  return GATE_TABLE[harnessName] !== undefined;
}

// Whether the rendered screen `text` is a recognized permission gate for `harnessName`. Pure and
// deterministic; any harness without a table entry returns false.
export function detectPermissionGate(text: string, harnessName: string): boolean {
  const entry = GATE_TABLE[harnessName];
  return entry ? entry.detect(text) : false;
}

// A one-line security warning to append to a harness tab's transcript when it launches
// auto-approving (`-y`) but without a workspace: with no disposable clone (and, on macOS, no
// sandbox) confining it, an auto-approved prompt acts on the user's real working directory
// unattended. Undefined when auto-approve is off, so callers only surface it when there's
// something to warn about.
export function autoApproveWithoutWorkspaceWarning(autoApprove: boolean): string | undefined {
  return autoApprove
    ? 'auto-approve is on without a workspace: prompts are approved unattended against your real files, with no sandbox confining the harness'
    : undefined;
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
    notify: (message: string, capture?: ScreenCapture) => void;
  }) {
    this.keystroke = GATE_TABLE[opts.harnessName]?.keystroke ?? '\r';
  }

  // Whether the approver has stood down on a gate it could not clear — the signal busy/ready
  // tracking uses to badge a gate that still needs the user despite auto-approve being on.
  get isStuck(): boolean { return this.stuckNotified; }

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
    this.opts.notify('Auto-approved a permission prompt', capture);
  }
}
