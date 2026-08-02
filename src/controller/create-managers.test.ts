import { describe, it, expect, vi } from 'vitest';
import { Controller } from '../controller.js';
import { openNotificationsTab } from '../notifications-tab.js';

// The external-open path shells out to the OS image viewer; stub it so tests never launch an app.
vi.mock('../openers/os-open.js', () => ({ didOsOpen: () => true }));
// Mock spawnPty so harness/agent tab creation never spawns real processes.
vi.mock('../pty.js');

const makeController = () => new Controller({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} });

const feedText = (c: Controller) =>
  c.view().find((t) => t.view === 'notifications')?.bufferLines.map((l) => l.text).join('\n') ?? '';

describe('createManagers question-pending wiring', () => {
  it('notifies when a question becomes pending for a background tab', () => {
    const c = makeController();
    c.dispatch('agent bob');
    openNotificationsTab(c.managers);
    c.setActiveTab(c.view().findIndex((t) => t.label === 'janus')); // janus active; bob is the background tab
    void c.managers.questions.register({ tab: 'bob', kind: 'ask', question: 'ok?' });
    expect(feedText(c)).toContain('Question from bob');
  });

  it('does not notify when the question is pending for the already-active tab', () => {
    const c = makeController();
    openNotificationsTab(c.managers);
    c.setActiveTab(c.view().findIndex((t) => t.label === 'janus'));
    void c.managers.questions.register({ tab: 'janus', kind: 'ask', question: 'ok?' });
    expect(feedText(c)).not.toContain('Question from janus');
  });
});

describe('createManagers plugin-host lifecycle', () => {
  it('constructs the plugin host before managers that consume its registries', () => {
    const c = makeController();
    const order = Object.keys(c.managers);
    expect(order.indexOf('plugins')).toBeLessThan(order.indexOf('openFile'));
    expect(order.indexOf('plugins')).toBeLessThan(order.indexOf('command'));
  });

  it('disposes consumers before the plugin host during reverse-order shutdown', async () => {
    const c = makeController();
    const disposed: string[] = [];
    c.managers.plugins.dispose = vi.fn(() => { disposed.push('plugins'); });
    c.managers.openFile.dispose = vi.fn(() => { disposed.push('openFile'); });
    await c.shutdown();
    expect(disposed).toEqual(['openFile', 'plugins']);
  });

  it('waits for an asynchronous manager disposal before shutdown resolves', async () => {
    const c = makeController();
    let settled = false;
    c.managers.plugins.dispose = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      settled = true;
    });

    await c.shutdown();

    expect(settled).toBe(true);
  });
});
