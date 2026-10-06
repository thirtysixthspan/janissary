import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireControllerEvents } from './events.js';
import { messageBus } from '../bus.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Sinks } from './types.js';

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

// The subscriptions that project a bus event onto a client sink, and the two guards in front of
// them. Each of these is the only place a given event becomes something the client sees, so a
// projection that quietly drops a field is invisible everywhere else.
describe('the bus subscriptions the controller projects onto clients', () => {
  function wire(): { managers: Managers; sinks: Sinks & Record<string, ReturnType<typeof vi.fn>> } {
    const tab = makeTab('work', 'red');
    const managers = {
      tab: {
        tabs: [tab],
        harnessTabByPtyId: vi.fn(() => tab),
        closeTab: vi.fn(),
      },
    } as unknown as Managers;
    const sinks = {
      emitState: vi.fn(),
      sendPty: vi.fn(),
      sendPtyExit: vi.fn(),
      exit: vi.fn(),
      sendLayout: vi.fn(),
      sendCollectTreeState: vi.fn(),
      sendToast: vi.fn(),
      sendToastClear: vi.fn(),
      sendNotificationsReveal: vi.fn(),
    } as unknown as Sinks & Record<string, ReturnType<typeof vi.fn>>;
    wireControllerEvents(managers, sinks);
    return { managers, sinks };
  }

  it('projects a layout update field for field', () => {
    const { sinks } = wire();
    const update = {
      type: 'update' as const, sidebarLeft: 200, sidebarRight: 0, tabAreaPct: 62,
      focusLeft: 'files' as const, focusRight: undefined,
    };

    messageBus.emit('layout', update);

    expect(sinks.sendLayout).toHaveBeenCalledWith({
      sidebarLeft: 200, sidebarRight: 0, tabAreaPct: 62, focusLeft: 'files', focusRight: undefined,
    });
  });

  it('passes a layout update through whole, without its bus discriminant', () => {
    const { sinks } = wire();

    messageBus.emit('layout', { type: 'update', tabAreaPct: 40, focusRight: 'notifications' });

    expect(sinks.sendLayout.mock.calls[0][0]).toStrictEqual({ tabAreaPct: 40, focusRight: 'notifications' });
  });

  it('projects a selection-collection request as its id alone', () => {
    const { sinks } = wire();

    messageBus.emit('fileNavigator', { type: 'collect', id: 7 });

    expect(sinks.sendCollectTreeState).toHaveBeenCalledWith({ id: 7 });
  });

  // The bus keys subscriptions by channel and type, so a handler registered for one type never sees
  // another. Pinned here because it is what makes the type guards inside the handlers unreachable,
  // and because a sink reached by an event it did not ask for is the failure this rules out.
  it('reaches no sink when a channel carries a type nothing subscribed to', () => {
    const { sinks } = wire();

    messageBus.emit('transcript', { type: 'entry:removed', tab: 'work' } as never);
    messageBus.emit('pty', { type: 'resize', id: 'pty1' } as never);

    expect(sinks.sendPty).not.toHaveBeenCalled();
    expect(sinks.sendPtyExit).not.toHaveBeenCalled();
  });

  it('exits the process on an app exit', () => {
    const { sinks } = wire();

    messageBus.emit('app', { type: 'exit' } as never);

    expect(sinks.exit).toHaveBeenCalledOnce();
  });
});
