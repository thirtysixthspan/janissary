import { describe, expect, it, vi, beforeEach } from 'vitest';
import { captureWiring } from './wire.js';
import { buildAutoApprover } from '../auto-approve-wire.js';
import { buildAutoResumer } from '../auto-resume-wire.js';
import { busyStatusHandler } from '../busy-status.js';
import type { ScreenCapture } from '../screen.js';
import type { Managers } from '../../managers.js';

vi.mock('../auto-approve-wire.js', () => ({ buildAutoApprover: vi.fn() }));
vi.mock('../auto-resume-wire.js', () => ({ buildAutoResumer: vi.fn() }));
vi.mock('../busy-status.js', () => ({ busyStatusHandler: vi.fn() }));

const managers = {} as Managers;

function capture(settled?: true): ScreenCapture {
  return { text: 'screen', capturedAt: 0, ...(settled && { settled }) };
}

describe('captureWiring', () => {
  const approver = { onCapture: vi.fn(), isStuck: false };
  const resumer = { onCapture: vi.fn(), isParked: false };
  const busy = vi.fn();

  beforeEach(() => {
    approver.onCapture.mockReset();
    resumer.onCapture.mockReset();
    busy.mockReset();
    // Cleared as well as reset, so a case asserting a builder was never called is reading this case
    // and not the one before it.
    vi.mocked(buildAutoApprover).mockClear().mockReturnValue(approver as never);
    vi.mocked(buildAutoResumer).mockClear().mockReturnValue(resumer as never);
    vi.mocked(busyStatusHandler).mockClear().mockReturnValue(busy);
  });

  it('feeds an ordinary capture to the approver, then the resumer, then the busy handler', () => {
    const order: string[] = [];
    approver.onCapture.mockImplementation(() => { order.push('approver'); });
    resumer.onCapture.mockImplementation(() => { order.push('resumer'); });
    busy.mockImplementation(() => { order.push('busy'); });
    const { handler } = captureWiring(managers, 'codex', 'codex', 'pty-1', true, true);
    handler?.(capture());
    // The resumer runs before the busy handler so the handler reads its parked state as of this
    // same capture; a capture reaching them the other way round would badge a tab already parked.
    expect(order).toEqual(['approver', 'resumer', 'busy']);
  });

  it('feeds a settled re-read to the busy handler only', () => {
    const { handler } = captureWiring(managers, 'codex', 'codex', 'pty-1', true, true);
    handler?.(capture(true));
    expect(approver.onCapture).not.toHaveBeenCalled();
    expect(resumer.onCapture).not.toHaveBeenCalled();
    expect(busy).toHaveBeenCalledWith(capture(true));
  });

  it('builds no resumer for a launch with auto-resume off, and reports none', () => {
    const { handler, autoResumer } = captureWiring(managers, 'codex', 'codex', 'pty-1', true, false);
    expect(buildAutoResumer).not.toHaveBeenCalled();
    expect(autoResumer).toBeUndefined();
    handler?.(capture());
    expect(resumer.onCapture).not.toHaveBeenCalled();
    expect(busy).toHaveBeenCalledOnce();
  });

  it('feeds the resumer with auto-approve off, so a limit is still recognized', () => {
    const { handler } = captureWiring(managers, 'codex', 'codex', 'pty-1', false, true);
    expect(buildAutoApprover).not.toHaveBeenCalled();
    expect(buildAutoResumer).toHaveBeenCalledOnce();
    handler?.(capture());
    expect(resumer.onCapture).toHaveBeenCalledOnce();
    expect(busy).toHaveBeenCalledOnce();
  });
});