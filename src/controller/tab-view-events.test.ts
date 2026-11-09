import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireControllerEvents } from './events.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { Sinks } from './types.js';
import type { TabView } from '../protocol.js';

afterEach(() => messageBus.clear());

describe('state dirty projection', () => {
  const view = { label: 'work' } as TabView;

  function wire(tabView: (label: string) => TabView | undefined) {
    const sinks = { emitState: vi.fn(), sendTabView: vi.fn(), sendPty: vi.fn(), sendPtyExit: vi.fn() };
    wireControllerEvents({} as Managers, sinks as unknown as Sinks, tabView);
    return sinks;
  }

  it('sends only the named tab view for a transcript dirty', () => {
    const tabView = vi.fn(() => view);
    const sinks = wire(tabView);

    messageBus.emit('state', { type: 'dirty', tab: 'work' });

    expect(tabView).toHaveBeenCalledWith('work');
    expect(sinks.sendTabView).toHaveBeenCalledWith({ tab: view });
    expect(sinks.emitState).not.toHaveBeenCalled();
  });

  it('sends the full snapshot for an unlabelled dirty', () => {
    const sinks = wire(() => view);

    messageBus.emit('state', { type: 'dirty' });

    expect(sinks.emitState).toHaveBeenCalledOnce();
    expect(sinks.sendTabView).not.toHaveBeenCalled();
  });

  it('falls back to the full snapshot when the tab can no longer be projected', () => {
    const sinks = wire(() => void 0);

    messageBus.emit('state', { type: 'dirty', tab: 'gone' });

    expect(sinks.emitState).toHaveBeenCalledOnce();
    expect(sinks.sendTabView).not.toHaveBeenCalled();
  });
});
