import { describe, expect, it } from 'vitest';
import type { TabPluginTopicAction } from './api-topics.js';
import { disabledTopicActionResult, isAwaitedTopicAction } from './api-topic-action-capability.js';

const awaited: TabPluginTopicAction[] = [
  { topic: 'models', action: 'delete' } as TabPluginTopicAction,
  { topic: 'commands', action: 'set' } as TabPluginTopicAction,
];

const synchronous: TabPluginTopicAction[] = [
  { topic: 'models', action: 'refresh' } as TabPluginTopicAction,
  { topic: 'commands', action: 'reset' } as TabPluginTopicAction,
  { topic: 'sessions', action: 'refresh' } as TabPluginTopicAction,
];

describe('the awaited topic action declaration', () => {
  it.each(awaited)('reports $topic/$action as awaited', (action) => {
    expect(isAwaitedTopicAction(action)).toBe(true);
  });

  it.each(synchronous)('reports $topic/$action as not awaited', (action) => {
    expect(isAwaitedTopicAction(action)).toBe(false);
  });

  it.each(awaited)('answers a disabled $topic/$action with a resolved promise', async (action) => {
    const result = disabledTopicActionResult(action);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it.each(synchronous)('answers a disabled $topic/$action with undefined', (action) => {
    expect(disabledTopicActionResult(action)).toBeUndefined();
  });
});
