import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { buildAutoApprover } from './auto-approve-wire.js';
import { writeCaptureFile } from './capture/file.js';
import { notify } from '../notifications/index.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('./capture/file.js', () => ({ writeCaptureFile: vi.fn(() => '/project/.janissary/captures/bot-now.txt') }));

const GATE = 'Do you want to proceed?\n❯ 1. Yes\n  2. No';

function setup(): { tab: Tab; input: ReturnType<typeof vi.fn>; managers: Managers } {
  const tab = { label: 'bot', harness: { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running' } } as unknown as Tab;
  const input = vi.fn();
  const managers = {
    pty: { input },
    tab: { harnessTab: (label: string) => (label === 'bot' ? tab : undefined) },
  } as unknown as Managers;
  return { tab, input, managers };
}

describe('buildAutoApprover', () => {
  it('lights the tab\'s auto-approve flag when it injects an approval', () => {
    const { tab, input, managers } = setup();
    buildAutoApprover(managers, 'claude', 'bot', 'pty1').onCapture({ text: GATE, capturedAt: 0 });
    expect(input).toHaveBeenCalledWith('pty1', '\r');
    expect(tab.harness?.autoApproved).toBe(true);
  });

  it('links the approved screen\'s capture file to the approval notification', () => {
    const { managers } = setup();
    buildAutoApprover(managers, 'claude', 'bot', 'pty1').onCapture({ text: GATE, capturedAt: 5 });
    expect(writeCaptureFile).toHaveBeenCalledWith('bot', 5, GATE);
    expect(notify).toHaveBeenLastCalledWith(
      managers, 'auto-approve', 'bot', 'Auto-approved a permission prompt',
      { openFile: '/project/.janissary/captures/bot-now.txt' },
    );
  });

  it('writes a capture for a gate it could not clear and links it to the stand-down notification', () => {
    const { managers } = setup();
    const approver = buildAutoApprover(managers, 'claude', 'bot', 'pty1');
    approver.onCapture({ text: GATE, capturedAt: 5 });
    vi.mocked(writeCaptureFile).mockClear();
    approver.onCapture({ text: GATE, capturedAt: 9 });
    expect(writeCaptureFile).toHaveBeenCalledWith('bot', 9, GATE);
    expect(notify).toHaveBeenLastCalledWith(
      managers, 'auto-approve', 'bot', 'Auto-approve could not clear the permission prompt; standing down',
      { openFile: '/project/.janissary/captures/bot-now.txt' },
    );
  });

  it('leaves the flag unlit while no gate has been approved', () => {
    const { tab, managers } = setup();
    buildAutoApprover(managers, 'claude', 'bot', 'pty1').onCapture({ text: '❯ ', capturedAt: 0 });
    expect(tab.harness?.autoApproved).toBeUndefined();
  });
});
