import { describe, it, expect, vi } from 'vitest';
import { defineDockableList } from './define-list-tab.js';
import { TabPluginRejection, type TabPluginServerCapabilities } from './api.js';
import type { TabPluginNotification } from './api.js';

// The two steps every dockable list plugin would otherwise re-implement by hand. The guards are the
// interesting half: a host and a plugin that disagree about a topic's shape must fail the request
// loudly on the command path and quietly on the notify path, because a delivery that arrives while
// nobody is asking is not worth interrupting a repaint over.

type Entry = { id: string; label: string };

const isData = (value: unknown): value is Entry[] => Array.isArray(value)
  && value.every((item) => typeof item === 'object' && item !== null && 'id' in item);

const list = defineDockableList<Entry>({
  topic: 'schedules',
  instanceKey: 'schedules:list',
  title: 'Schedules',
  isData,
  toPayload: (data) => ({ schedules: data }),
});

function capabilities(data: unknown = [{ id: 'a', label: 'Standup' }]): {
  capabilities: TabPluginServerCapabilities;
  opened: unknown[];
  updated: unknown[];
  docked: { key: string; dock: 'left' | 'right' | null }[];
} {
  const opened: unknown[] = [];
  const updated: unknown[] = [];
  const docked: { key: string; dock: 'left' | 'right' | null }[] = [];
  const value = {
    openOrFocusTab: vi.fn((_key: string, factory: () => unknown) => { opened.push(factory()); }),
    updateTab: vi.fn((_key: string, factory: () => unknown) => { updated.push(factory()); }),
    dockTab: vi.fn((key: string, dock: 'left' | 'right' | null) => { docked.push({ key, dock }); }),
    topicData: vi.fn(() => data),
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { capabilities: value, opened, updated, docked };
}

function notification(data: unknown, topic = 'schedules'): TabPluginNotification {
  return { topic, data } as unknown as TabPluginNotification;
}

describe('defineDockableList command', () => {
  it('opens the singleton tab under the topic name and maps the topic slice', () => {
    const f = capabilities();

    list.command('', f.capabilities);

    expect(f.opened).toEqual([{ title: 'Schedules', payload: { schedules: [{ id: 'a', label: 'Standup' }] } }]);
  });

  it('docks where the argument says, and centres on a bare one', () => {
    for (const [argument, dock] of [['left', 'left'], ['right', 'right'], ['', null]] as const) {
      const f = capabilities();
      list.command(argument, f.capabilities);
      expect(f.docked).toEqual([{ key: 'schedules:list', dock }]);
    }
  });

  it('rejects a side it was not given rather than guessing one', () => {
    const f = capabilities();

    expect(() => list.command('middle', f.capabilities))
      .toThrow(new TabPluginRejection('Usage: schedules [left|right]'));
    expect(f.opened).toEqual([]);
  });

  // The host computed the slice and the plugin could not read it, which means the two disagree about
  // the topic's shape. That is a failure the author needs to see, so the request is reported.
  it('reports topic data the plugin cannot read instead of opening an unreadable tab', () => {
    const f = capabilities({ schedules: [] });

    expect(() => list.command('', f.capabilities)).toThrow('invalid schedules topic data');
    expect(f.opened).toEqual([]);
    expect(f.docked).toEqual([]);
  });
});

describe('defineDockableList notify', () => {
  it('repaints the open tab in place, sending no title', () => {
    const f = capabilities();

    list.notify(notification([{ id: 'b', label: 'Review' }]), f.capabilities);

    expect(f.updated).toEqual([{ payload: { schedules: [{ id: 'b', label: 'Review' }] } }]);
  });

  it('ignores a notification for another topic', () => {
    const f = capabilities();

    list.notify(notification([{ id: 'b', label: 'Review' }], 'conversations'), f.capabilities);

    expect(f.updated).toEqual([]);
  });

  // Here the two disagreeing is not the author's problem to hear about mid-session: there is no
  // request to reject and no one waiting on an answer, so a slice the plugin cannot read is dropped.
  it('drops a slice it cannot read rather than repainting from it', () => {
    const f = capabilities();

    list.notify(notification({ schedules: [] }), f.capabilities);

    expect(f.updated).toEqual([]);
  });
});
