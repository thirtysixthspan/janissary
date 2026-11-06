import { describe, it, expect, vi } from 'vitest';
import { HarnessAutoApprover, AUTO_APPROVED_MESSAGE, AUTO_APPROVE_STUCK_MESSAGE } from './auto-approve.js';

// A subagent's gate as captured live in a claude tab whose subagent re-ran the same command, so the
// identical prompt came straight back after it was approved.
const SUBAGENT_RETRY_GATE = [
  '⏺ The first subagent is working on the common-prefix completion',
  '  issue. I\'ll start the picker issue once it merges.',
  '',
  '✻ Waiting for 1 background agent to finish',
  '',
  '─────────────────────────────────────────────────────────────────',
  ' Bash command · from the general-purpose agent',
  ' Tip: auto mode handles these prompts for you — choose "switch ',
  ' to auto mode" below',
  ' Retry squash-merge',
  '╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌',
  ' │ $janissary/scripts/run.mjs pr-merge ',
  ' │ shell/completion-common-prefix thirtysixthspan/janissary',
  '╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌',
  ' A variable in this command can\'t be checked before it runs',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and switch to auto mode · auto mode handles these ',
  '      prompts for you',
  '   3. No',
  '',
  ' Esc to cancel · Tab to amend · ctrl+x ctrl+k twice to stop bac…',
].join('\n');

function make() {
  const approve = vi.fn();
  const notify = vi.fn();
  const approver = new HarnessAutoApprover({ harnessName: 'claude', approve, notify });
  return { approver, approve, notify };
}

function feed(approver: HarnessAutoApprover, times: number): void {
  for (let i = 0; i < times; i++) approver.onCapture({ text: SUBAGENT_RETRY_GATE, capturedAt: i });
}

describe('HarnessAutoApprover on an identical gate that comes straight back', () => {
  it('approves the repeated subagent gate again instead of standing down', () => {
    const { approver, approve, notify } = make();
    feed(approver, 2);
    expect(approve).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalledWith(AUTO_APPROVE_STUCK_MESSAGE, expect.anything());
    expect(approver.isStuck).toBe(false);
  });

  it('stands down once the identical gate outlasts three approvals', () => {
    const { approver, approve, notify } = make();
    feed(approver, 5);
    expect(approve).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledTimes(4);
    expect(notify).toHaveBeenNthCalledWith(3, AUTO_APPROVED_MESSAGE, expect.anything());
    expect(notify).toHaveBeenLastCalledWith(AUTO_APPROVE_STUCK_MESSAGE, expect.anything());
    expect(approver.isStuck).toBe(true);
  });

  it('restores the full approval budget once the screen leaves the gate', () => {
    const { approver, approve } = make();
    feed(approver, 3);
    approver.onCapture({ text: 'back to normal output', capturedAt: 10 });
    feed(approver, 3);
    expect(approve).toHaveBeenCalledTimes(6);
    expect(approver.isStuck).toBe(false);
  });
});
