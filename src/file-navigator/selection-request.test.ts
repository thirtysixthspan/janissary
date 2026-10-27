import { describe, it, expect, vi } from 'vitest';
import { messageBus } from '../bus.js';
import { requestTreeSelections, resolveTreeSelections } from './selection-request.js';

// The id the request emitted, captured off the bus — callers never see it directly.
function nextRequest(): { id: number; selections: Promise<Map<string, { cursor?: string; selected: string[] }>> } {
  let id = 0;
  const subscription = messageBus.on('fileNavigator', 'collect', (event) => { id = event.id; });
  const selections = requestTreeSelections(20);
  subscription.unsubscribe();
  return { id, selections };
}

describe('requestTreeSelections', () => {
  it('resolves with the replying client\'s records, keyed by navigator label', async () => {
    const { id, selections } = nextRequest();

    resolveTreeSelections(id, [{ label: 'navigator', cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'] }]);

    const map = await selections;
    expect(map.get('navigator')).toEqual({ cursor: 'src/a.ts', anchor: 'src', selected: ['src', 'src/a.ts'] });
  });

  it('ignores a reply carrying an id that is not the request in flight', async () => {
    const { id, selections } = nextRequest();

    resolveTreeSelections(id + 99, [{ label: 'navigator', selected: ['src'] }]);

    expect(await selections).toEqual(new Map());
  });

  it('resolves empty when no reply arrives before the timeout', async () => {
    vi.useFakeTimers();
    const { selections } = nextRequest();

    await vi.advanceTimersByTimeAsync(25);

    expect(await selections).toEqual(new Map());
    vi.useRealTimers();
  });

  it('joins a request already in flight and shares its answer', async () => {
    let emitted = 0;
    let id = 0;
    const subscription = messageBus.on('fileNavigator', 'collect', (event) => { emitted += 1; id = event.id; });
    const first = requestTreeSelections(30);
    const second = requestTreeSelections(1);
    subscription.unsubscribe();

    expect(emitted).toBe(1);
    resolveTreeSelections(id, [{ label: 'navigator', selected: ['a'] }]);

    const [firstAnswer, secondAnswer] = await Promise.all([first, second]);
    expect(firstAnswer).toEqual(secondAnswer);
    expect(secondAnswer.get('navigator')).toEqual({ cursor: undefined, anchor: undefined, selected: ['a'] });
  });
});
