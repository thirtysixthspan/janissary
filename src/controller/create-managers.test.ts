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
