import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureWiring } from './wire.js';
import { buildAutoApprover } from '../auto-approve-wire.js';
import { busyStatusHandler } from '../busy-status.js';
import type { ScreenCapture } from '../screen.js';
import type { Managers } from '../../managers.js';

vi.mock('../auto-approve-wire.js', () => ({ buildAutoApprover: vi.fn() }));
vi.mock('../busy-status.js', () => ({ busyStatusHandler: vi.fn() }));

const managers = {} as Managers;

function capture(settled?: true): ScreenCapture {
  return { text: 'screen', capturedAt: 0, ...(settled && { settled }) };
}

describe('captureWiring', () => {
  const approver = { onCapture: vi.fn(), isStuck: false };
  const busy = vi.fn();

  beforeEach(() => {
    approver.onCapture.mockReset();
    busy.mockReset();
    vi.mocked(buildAutoApprover).mockReturnValue(approver as never);
    vi.mocked(busyStatusHandler).mockReturnValue(busy);
  });

  it('feeds an ordinary capture to the approver and then the busy handler', () => {
    const { handler } = captureWiring(managers, 'claude', 'claude', 'pty-1', true);
    handler?.(capture());
    expect(approver.onCapture).toHaveBeenCalledOnce();
    expect(busy).toHaveBeenCalledOnce();
  });

  it('feeds a settled re-read to the busy handler only', () => {
    const { handler } = captureWiring(managers, 'claude', 'claude', 'pty-1', true);
    handler?.(capture(true));
    expect(approver.onCapture).not.toHaveBeenCalled();
    expect(busy).toHaveBeenCalledWith(capture(true));
  });
});
