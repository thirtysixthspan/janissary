import { describe, it, expect, vi } from 'vitest';
import { detectPermissionGate, HarnessAutoApprover } from './auto-approve.js';
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

const ALL_GATES = { BASH_IN_PROJECT, BASH_OUT_OF_PROJECT, FETCH, SUBAGENT_TWO_OPTION, MCP_TOOL };

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

  it('does not match a gate-shaped block that has scrolled above the last-10-line window', () => {
    const quoted = [BASH_IN_PROJECT, '', '', '', '', '', '', '', '', '', ' > now working on something else', ' $ '].join('\n');
    expect(detectPermissionGate(quoted, 'claude')).toBe(false);
  });
});

describe('detectPermissionGate — unarmed harnesses', () => {
  it('returns false for opencode even on a claude-shaped gate', () => {
    expect(detectPermissionGate(BASH_IN_PROJECT, 'opencode')).toBe(false);
  });

  it('returns false for codex even on a claude-shaped gate', () => {
    expect(detectPermissionGate(BASH_IN_PROJECT, 'codex')).toBe(false);
  });
});

describe('HarnessAutoApprover', () => {
  function make() {
    const approve = vi.fn();
    const notify = vi.fn();
    const approver = new HarnessAutoApprover({ harnessName: 'claude', approve, notify });
    return { approver, approve, notify };
  }

  it('approves with a carriage return and notifies once on a gate', () => {
    const { approver, approve, notify } = make();
    approver.onCapture(capture(BASH_IN_PROJECT));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith('\r');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Auto-approved a permission prompt');
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
});
