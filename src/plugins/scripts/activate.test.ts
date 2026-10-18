import { describe, expect, it, vi } from 'vitest';
import {
  TabPluginRejection,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
  type TabPluginTopicAction,
} from '../api.js';
import type { RunscriptsView } from '../../protocol.js';
import { activate } from './activate.js';

const VIEW: RunscriptsView = {
  rows: [
    { name: 'deploy', schedules: 1, open: false },
    { name: 'nightly', schedules: 0, open: true },
  ],
};
const ORIGIN = 'scripts-1';
const TAB_PAYLOAD = { rows: [] };

function fakeCapabilities(data: unknown = VIEW) {
  const order: string[] = [];
  const opened: { key: string; value: TabPluginPayload }[] = [];
  const updated: { key: string; value: TabPluginTabUpdate }[] = [];
  const actions: TabPluginTopicAction[] = [];
  const dockTab = vi.fn();
  const capabilities = {
    openOrFocusTab: (key: string, factory: () => TabPluginPayload) => {
      opened.push({ key, value: factory() });
    },
    updateTab: (key: string, factory: () => TabPluginTabUpdate) => {
      updated.push({ key, value: factory() });
    },
    dockTab,
    originTab: () => ({ label: ORIGIN, cwd: '/project', root: '/project' }),
    topicData: () => {
      order.push('topicData');
      return data;
    },
    topicAction: (action: TabPluginTopicAction) => {
      order.push('topicAction');
      actions.push(action);
    },
    rejectRequest: (reason: string): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason: unknown): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { actions, capabilities, dockTab, opened, order, updated };
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('scripts plugin command', () => {
  it('creates the directory through the origin label, then reads the topic', () => {
    const fixture = fakeCapabilities();

    activate().command?.('', fixture.capabilities);

    expect(fixture.actions).toEqual([{ topic: 'runscripts', action: 'ensureDirectory', origin: ORIGIN }]);
    expect(fixture.order).toEqual(['topicAction', 'topicData']);
  });

  it('opens the singleton tab titled scripts with the rows it was given', () => {
    const fixture = fakeCapabilities();

    activate().command?.('', fixture.capabilities);

    expect(fixture.opened).toEqual([{ key: 'scripts', value: { title: 'scripts', payload: VIEW } }]);
  });

  it('passes the same instance key on a second run, so the host focuses the open tab', () => {
    const fixture = fakeCapabilities();

    activate().command?.('', fixture.capabilities);
    activate().command?.('', fixture.capabilities);

    expect(fixture.opened.map((entry) => entry.key)).toEqual(['scripts', 'scripts']);
  });

  it('ignores its argument, so left and right open the tab without docking it', () => {
    for (const argument of ['left', 'right', 'sideways', '']) {
      const fixture = fakeCapabilities();

      activate().command?.(argument, fixture.capabilities);

      expect(fixture.opened.map((entry) => entry.key)).toEqual(['scripts']);
      expect(fixture.dockTab).not.toHaveBeenCalled();
    }
  });

  it('reports a failure, not a rejection, and opens nothing when the topic data fails the guard', () => {
    const fixture = fakeCapabilities({ rows: 'nope' });

    const error = thrownBy(() => activate().command?.('', fixture.capabilities));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TabPluginRejection);
    expect((error as Error).message).toBe('invalid runscripts topic data');
    expect(fixture.opened).toEqual([]);
  });
});

describe('scripts plugin notifications', () => {
  it('replaces the tab rows and leaves the tab strip name alone', () => {
    const fixture = fakeCapabilities();

    activate().notify?.({ topic: 'runscripts', data: VIEW, tabs: ['scripts'] }, fixture.capabilities);

    expect(fixture.updated).toEqual([{ key: 'scripts', value: { payload: VIEW } }]);
    expect(fixture.updated[0].value.title).toBeUndefined();
  });

  it('ignores a delivery whose data fails the guard', () => {
    const fixture = fakeCapabilities();
    const data = { rows: 'nope' } as unknown as RunscriptsView;

    activate().notify?.({ topic: 'runscripts', data, tabs: ['scripts'] }, fixture.capabilities);

    expect(fixture.updated).toEqual([]);
  });

  it('ignores a delivery for any other topic', () => {
    const fixture = fakeCapabilities();

    activate().notify?.({ topic: 'schedules', data: [], tabs: ['scripts'] }, fixture.capabilities);

    expect(fixture.updated).toEqual([]);
  });
});

describe('scripts plugin intents', () => {
  const intent = (name: string, payload: unknown, fixture: ReturnType<typeof fakeCapabilities>) =>
    activate().intent(
      { tab: 'scripts', intent: name, payload, tabPayload: TAB_PAYLOAD }, fixture.capabilities,
    );

  it('turns each intent into the topic action it names, carrying the origin label', () => {
    const fixture = fakeCapabilities();

    expect(intent('execute', { name: 'deploy' }, fixture)).toBeNull();
    expect(intent('delete', { name: 'deploy' }, fixture)).toBeNull();
    expect(intent('clone', { name: 'deploy' }, fixture)).toBeNull();
    expect(intent('create', {}, fixture)).toBeNull();
    expect(intent('open', { name: 'deploy' }, fixture)).toBeNull();

    expect(fixture.actions).toEqual([
      { topic: 'runscripts', action: 'execute', name: 'deploy', origin: ORIGIN },
      { topic: 'runscripts', action: 'delete', name: 'deploy', origin: ORIGIN },
      { topic: 'runscripts', action: 'clone', name: 'deploy', origin: ORIGIN },
      { topic: 'runscripts', action: 'create', origin: ORIGIN },
      { topic: 'runscripts', action: 'open', name: 'deploy', origin: ORIGIN },
    ]);
    expect(fixture.actions[3]).not.toHaveProperty('name');
  });

  it('answers malformed and unknown intents with a rejection, not a plugin failure', () => {
    const fixture = fakeCapabilities();
    for (const [name, payload, message] of [
      ['execute', {}, 'invalid execute payload'],
      ['delete', { name: 1 }, 'invalid delete payload'],
      ['clone', null, 'invalid clone payload'],
      ['open', ['deploy'], 'invalid open payload'],
      ['create', null, 'invalid create payload'],
      ['rename', { name: 'deploy' }, 'unknown scripts intent "rename"'],
    ] as const) {
      const error = thrownBy(() => intent(name, payload, fixture));
      expect(error).toBeInstanceOf(TabPluginRejection);
      expect((error as Error).message).toBe(message);
    }
    expect(fixture.actions).toEqual([]);
  });

  it('treats an invalid tab payload as a plugin failure rather than a rejection', () => {
    const fixture = fakeCapabilities();

    const error = thrownBy(() => activate().intent(
      { tab: 'scripts', intent: 'execute', payload: { name: 'deploy' }, tabPayload: { nope: true } },
      fixture.capabilities,
    ));

    expect(error).not.toBeInstanceOf(TabPluginRejection);
    expect((error as Error).message).toBe('invalid scripts tab payload');
    expect(fixture.actions).toEqual([]);
  });

  it('sends no topic action when no tab is the origin, and still answers null', () => {
    const fixture = fakeCapabilities();
    fixture.capabilities.originTab = () => null;

    expect(intent('execute', { name: 'deploy' }, fixture)).toBeNull();
    activate().command?.('', fixture.capabilities);

    expect(fixture.actions).toEqual([]);
    expect(fixture.opened).toEqual([]);
  });
});

describe('scripts plugin activation', () => {
  it('rejects both presentations of its opener, since it opens on a command and not a file', () => {
    const fixture = fakeCapabilities();
    const opener = activate().opener;

    expect(() => opener.inline('a.txt', fixture.capabilities))
      .toThrow(new TabPluginRejection('scripts opens no files'));
    expect(() => opener.external('a.txt', fixture.capabilities))
      .toThrow(new TabPluginRejection('scripts opens no files'));
  });

  it('acquires nothing, so it has no dispose', () => {
    expect(activate().dispose).toBeUndefined();
  });
});
