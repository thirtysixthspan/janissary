import { describe, it, expect, vi } from 'vitest';
import { detectPermissionGate, HarnessAutoApprover, autoApproveWithoutWorkspaceWarning, supportsHarnessAutoApprove } from './auto-approve.js';
import type { ScreenCapture } from './screen.js';

// The five claude gate variants captured live (see the plan's Ground truth section).
const BASH_IN_PROJECT = [
  ' Bash command',
  '',
  '   touch /Users/ashmorgan/dev/janissary/gate-probe.txt',
  '   Create a probe file to test the permission gate',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and always allow access to janissary/ from this project',
  '   3. No',
  '',
  ' Esc to cancel · Tab to amend · ctrl+e to explain',
].join('\n');

const BASH_OUT_OF_PROJECT = [
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and always allow access to ashmorgan/ from this project',
  '   3. No',
  '',
  ' Esc to cancel · Tab to amend · ctrl+e to explain',
].join('\n');

const FETCH = [
  ' Fetch',
  '',
  '   url: "https://example.com", prompt: "What is the title of this page?"',
  '   Claude wants to fetch content from example.com',
  '',
  ' Do you want to allow Claude to fetch this content?',
  ' ❯ 1. Yes',
  "   2. Yes, and don't ask again for example.com",
  '   3. No, and tell Claude what to do differently (esc)',
].join('\n');

const SUBAGENT_TWO_OPTION = [
  ' Bash command · from the general-purpose agent',
  '',
  '   for f in security link-scout summarizer algorithm; do echo "== $f =="; done',
  '   Run shell command',
  '',
  ' Contains simple_expansion',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. No',
  '',
  ' Esc to cancel · Tab to amend · ctrl+e to explain',
].join('\n');

const MCP_TOOL = [
  ' Tool use',
  '',
  "   claude.ai Google Calendar - Returns the calendars on the user's calendar list. (MCP)",
  '   Returns the calendars this user has access to (their calendar list)…',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2.Yes, and don\'t ask again for claude.ai Google Calendar - … commands in /Users/ashmorgan/dev/janissary',
  '   3. No',
  '',
  ' Esc to cancel · Tab to amend',
].join('\n');

// A gate with claude's task panel pinned below it — the options are pushed well above the bottom
// of the capture, which used to defeat the last-10-lines window (the reported failure).
const GATE_WITH_TASK_LIST = [
  ' Bash command',
  '',
  String.raw`   for f in src/types.ts src/bus.ts; do n=$(grep -cve "^\s*$" "$f"); echo "$n $f"; done`,
  '   Check line counts of touched files against 200-line limit',
  '',
  ' Contains simple_expansion',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. No',
  '',
  ' Esc to cancel · Tab to amend · ctrl+e to explain',
  '',
  '  9 tasks (8 done, 1 in progress, 0 open)',
  '  ◼ Run check-diff, fix issues, update spec, promote plan, open PR',
  '  ✔ Server: types.ts, bus.ts, protocol.ts wiring',
  '  ✔ Server: reserved-file loader + profiles.ts re-export',
  '  ✔ Server: cdp-window-resize.ts + window-resizer.ts (new modules)',
  '  ✔ Server: main.ts wiring + controller/events.ts + index.ts broadcast',
  '   … +4 completed',
].join('\n');

// A plain three-option bash gate — no task panel, no extra chrome. Structurally the common case;
// kept as a fixture because it was reported failing in the field (see the harness spec).
const BASH_TEMP_CLEANUP = [
  ' Bash command',
  '',
  '   rm -f ./temp/pr-body.md',
  '   Clean up scratch PR body file',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and always allow access to temp/ from this project',
  '   3. No',
  '',
  ' Esc to cancel · Tab to amend · ctrl+e to explain',
].join('\n');

const ALL_GATES = { BASH_IN_PROJECT, BASH_OUT_OF_PROJECT, FETCH, SUBAGENT_TWO_OPTION, MCP_TOOL, GATE_WITH_TASK_LIST, BASH_TEMP_CLEANUP };

// A codex command-execution overlay: distinct title and `›` selection glyph from claude's gates.
const CODEX_GATE = [
  ' Would you like to run the following command?',
  '',
  '   npm test',
  '',
  ' › 1. Yes, proceed',
  '   2. No, provide feedback',
  '',
  ' Press Enter to confirm · Esc to cancel',
].join('\n');

function capture(text: string): ScreenCapture {
  return { text, capturedAt: Date.now() };
}

describe('detectPermissionGate — claude', () => {
  for (const [name, text] of Object.entries(ALL_GATES)) {
    it(`matches the ${name} gate`, () => {
      expect(detectPermissionGate(text, 'claude')).toBe(true);
    });
  }

  it('does not match ordinary output', () => {
    expect(detectPermissionGate('just some normal harness output\nnothing to approve here', 'claude')).toBe(false);
  });

  it('does not match a resolved prompt (menu gone)', () => {
    const resolved = [' Do you want to proceed?', '', ' Running…', '   touch gate-probe.txt'].join('\n');
    expect(detectPermissionGate(resolved, 'claude')).toBe(false);
  });

  it('does not match y/n-looking prose', () => {
    expect(detectPermissionGate('The answer is yes. Type y to continue or n to abort.', 'claude')).toBe(false);
  });

  it('does not match a gate-shaped block that has scrolled above claude’s live input caret', () => {
    // The old gate is in scrollback; claude sits back at its own prompt (the `❯` input caret) below.
    const quoted = [BASH_IN_PROJECT, '', '', ' ❯ now working on something else', '', ' ? for shortcuts'].join('\n');
    expect(detectPermissionGate(quoted, 'claude')).toBe(false);
  });

  it('still matches a gate followed by passive chrome (status lines, no input caret)', () => {
    const withChrome = [BASH_TEMP_CLEANUP, '', ' ? for shortcuts', '   Context left until auto-compact: 23%'].join('\n');
    expect(detectPermissionGate(withChrome, 'claude')).toBe(true);
  });
});

describe('detectPermissionGate — codex', () => {
  it('matches a codex overlay routed to the codex matcher', () => {
    expect(detectPermissionGate(CODEX_GATE, 'codex')).toBe(true);
  });

  it('does not match a codex overlay against claude', () => {
    expect(detectPermissionGate(CODEX_GATE, 'claude')).toBe(false);
  });

  it('does not match a claude-shaped gate against codex', () => {
    expect(detectPermissionGate(BASH_IN_PROJECT, 'codex')).toBe(false);
  });
});

describe('detectPermissionGate — unarmed harnesses', () => {
  it('returns false for opencode even on a claude-shaped gate', () => {
    expect(detectPermissionGate(BASH_IN_PROJECT, 'opencode')).toBe(false);
  });

  it('returns false for opencode even on a codex-shaped gate', () => {
    expect(detectPermissionGate(CODEX_GATE, 'opencode')).toBe(false);
  });
});

describe('HarnessAutoApprover', () => {
  function make() {
    const approve = vi.fn();
    const notify = vi.fn();
    const approver = new HarnessAutoApprover({ harnessName: 'claude', approve, notify });
    return { approver, approve, notify };
  }

  it('approves with a carriage return and notifies once on a gate, passing the capture', () => {
    const { approver, approve, notify } = make();
    const cap = capture(BASH_IN_PROJECT);
    approver.onCapture(cap);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith('\r');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Auto-approved a permission prompt', cap);
  });

  it('injects the codex table keystroke on a codex overlay', () => {
    const approve = vi.fn();
    const notify = vi.fn();
    const approver = new HarnessAutoApprover({ harnessName: 'codex', approve, notify });
    approver.onCapture(capture(CODEX_GATE));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith('\r');
    expect(notify).toHaveBeenCalledWith('Auto-approved a permission prompt', expect.anything());
  });

  it('does not inject on a non-gate capture', () => {
    const { approver, approve, notify } = make();
    approver.onCapture(capture('nothing here'));
    expect(approve).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('suppresses re-injection when the identical gate text recurs, notifying once', () => {
    const { approver, approve, notify } = make();
    approver.onCapture(capture(BASH_IN_PROJECT));
    approver.onCapture(capture(BASH_IN_PROJECT));
    approver.onCapture(capture(BASH_IN_PROJECT));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith('Auto-approve could not clear the permission prompt; standing down');
  });

  it('approves again when the screen changes to a new gate', () => {
    const { approver, approve } = make();
    approver.onCapture(capture(BASH_IN_PROJECT));
    approver.onCapture(capture(FETCH));
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it('resets after a non-gate capture so an identical earlier gate approves again', () => {
    const { approver, approve } = make();
    approver.onCapture(capture(BASH_IN_PROJECT));
    approver.onCapture(capture('back to normal output'));
    approver.onCapture(capture(BASH_IN_PROJECT));
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it('reports isStuck only once the stuck-notification path fires, and false again after clearing', () => {
    const { approver } = make();
    expect(approver.isStuck).toBe(false);
    approver.onCapture(capture(BASH_IN_PROJECT));
    expect(approver.isStuck).toBe(false);
    approver.onCapture(capture(BASH_IN_PROJECT));
    expect(approver.isStuck).toBe(true);
    approver.onCapture(capture('back to normal output'));
    expect(approver.isStuck).toBe(false);
  });
});

describe('supportsHarnessAutoApprove', () => {
  it('accepts claude and codex, rejects opencode and unknown harnesses', () => {
    expect(supportsHarnessAutoApprove('claude')).toBe(true);
    expect(supportsHarnessAutoApprove('codex')).toBe(true);
    expect(supportsHarnessAutoApprove('opencode')).toBe(false);
    expect(supportsHarnessAutoApprove('gemini')).toBe(false);
  });
});

describe('autoApproveWithoutWorkspaceWarning', () => {
  it('returns a warning string when auto-approve is on', () => {
    expect(typeof autoApproveWithoutWorkspaceWarning(true)).toBe('string');
  });

  it('returns undefined when auto-approve is off', () => {
    expect(autoApproveWithoutWorkspaceWarning(false)).toBeUndefined();
  });
});
