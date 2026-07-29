import { describe, it, expect, vi } from 'vitest';
import { messageBus } from '../bus.js';
import { requestTreeSelections, resolveTreeSelections } from './selection-request.js';

// The id the request emitted, captured off the bus — callers never see it directly.
function nextRequest(): { id: number; selections: Promise<Map<number, { cursor?: string; selected: string[] }>> } {
  let id = 0;
  const subscription = messageBus.on('fileNavigator', 'collect', (event) => { id = event.id; });
  const selections = requestTreeSelections(20);
  subscription.unsubscribe();
  return { id, selections };
}

describe('requestTreeSelections', () => {
  it('resolves with the replying client\'s records, keyed by tab index', async () => {
    const { id, selections } = nextRequest();

    resolveTreeSelections(id, [{ index: 2, cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'] }]);

    const map = await selections;
    expect(map.get(2)).toEqual({ cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'] });
  });

  it('ignores a reply carrying an id that is not the request in flight', async () => {
    const { id, selections } = nextRequest();

    resolveTreeSelections(id + 99, [{ index: 0, selected: ['src'] }]);

    expect(await selections).toEqual(new Map());
  });

  it('resolves empty when no reply arrives before the timeout', async () => {
    vi.useFakeTimers();
    const { selections } = nextRequest();

    await vi.advanceTimersByTimeAsync(25);

    expect(await selections).toEqual(new Map());
    vi.useRealTimers();
  });

  it('abandons a request already in flight when a new one is issued', async () => {
    const first = nextRequest();
    const second = nextRequest();

    resolveTreeSelections(second.id, [{ index: 1, selected: ['a'] }]);

    expect(await first.selections).toEqual(new Map());
    const settled = await second.selections;
    expect(settled.get(1)).toEqual({ cursor: undefined, anchor: undefined, selected: ['a'] });
  });
});
