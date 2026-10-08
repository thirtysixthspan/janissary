import { describe, expect, it } from 'vitest';
import { declaresCommandQueue, supportsCommandQueue } from './support.js';
import { buildTabView } from '../tab/view.js';
import { makeTab } from '../tab/index.js';
import { command } from '../commands/queue.js';
import type { TabPluginDeclaration } from '../plugins/api.js';
import type { Managers } from '../managers.js';
import { vi } from 'vitest';

const declaration = {
  id: 'worker-view', capabilities: ['queueLine', 'nextQueuedLine'],
} as unknown as TabPluginDeclaration;

function queuedTab() {
  return {
    ...makeTab('worker', '#fff'), view: 'plugin' as const,
    plugin: { id: declaration.id, instanceKey: 'worker', schemaVersion: 1, payload: {} },
  };
}

describe('core queue opt-in', () => {
  it('accepts any plugin requesting the queue capabilities without a terminal or command bar', () => {
    expect(supportsCommandQueue(queuedTab(), [declaration])).toBe(true);
    expect(declaresCommandQueue({ capabilities: ['queueLine'] })).toBe(false);
    expect(declaresCommandQueue(undefined)).toBe(false);
    expect(supportsCommandQueue(makeTab('agent', '#fff'), [declaration])).toBe(false);
    expect(supportsCommandQueue({ ...makeTab('core-view', '#fff'), hasCommandQueue: true }, [])).toBe(true);
  });

  it('publishes queue availability and entries only for opted-in tabs', () => {
    const view = (tab: ReturnType<typeof makeTab>, declarations: TabPluginDeclaration[]) => buildTabView(
      tab, false, '/repo', undefined, [], [], ['next'], (path) => path,
      undefined, undefined, undefined, undefined,
      (id) => declarations.find((entry) => entry.id === id),
    );
    expect(view(queuedTab(), [declaration])).toMatchObject({ hasCommandQueue: true, commandQueue: ['next'] });
    expect(view(queuedTab(), [])).toMatchObject({ commandQueue: [] });
    expect(view(makeTab('agent', '#fff'), [])).not.toHaveProperty('hasCommandQueue');
  });

  it('queues for a terminal-free plugin by display alias and rejects an agent', () => {
    const target = { ...queuedTab(), title: 'review' };
    const agent = makeTab('agent', '#fff');
    const enqueue = vi.fn();
    const append = vi.fn();
    const managers = {
      tab: { tabs: [target, agent], enqueue, append },
      plugins: { declarations: [declaration] },
    } as unknown as Managers;
    command.run('queue review process item', { label: 'agent', index: 1 }, managers);
    expect(enqueue).toHaveBeenCalledExactlyOnceWith('worker', 'process item');
    command.run('queue agent process item', { label: 'agent', index: 1 }, managers);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenLastCalledWith('agent', {
      input: 'queue agent process item', output: 'Tab "agent" has no command queue.',
    });
  });
});
