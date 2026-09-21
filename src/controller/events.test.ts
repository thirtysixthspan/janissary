import { afterEach, expect, it, vi } from 'vitest';
import { wireControllerEvents } from './events.js';
import { messageBus } from '../bus.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';

afterEach(() => messageBus.clear());

it.each([true, false])('retains an ended peer tab only when remote is %s', (remote) => {
  const tab = makeTab('work', 'red', 1, [], [], undefined, 1, 'red');
  tab.view = 'harness';
  tab.harness = { name: remote ? 'claude' : 'ssh', program: 'test', ptyId: 'pty1', status: 'exited', sessionTerminated: 'ended' };
  if (remote) tab.remote = { host: 'host', address: 'host' };
  const closeTab = vi.fn(), sendPtyExit = vi.fn();
  wireControllerEvents({ tab: { tabs: [tab], harnessTabByPtyId: () => tab, closeTab } } as unknown as Managers,
    { emitState: vi.fn(), sendPty: vi.fn(), sendPtyExit });
  messageBus.emit('pty', { type: 'exit', id: 'pty1', exitCode: 2 });
  expect(sendPtyExit).toHaveBeenCalledWith('pty1', 2);
  expect(closeTab).toHaveBeenCalledTimes(remote ? 0 : 1);
});
