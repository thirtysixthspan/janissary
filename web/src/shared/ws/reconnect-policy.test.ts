import { describe, expect, it } from 'vitest';
import { connectionPhase, reconnectDelay, RECONNECT_ESCALATION_ATTEMPTS } from './reconnect-policy';

describe('reconnect policy', () => {
  it('increases to a bounded delay and keeps retrying indefinitely', () => {
    const delays = Array.from({ length: 100 }, (_, attempt) => reconnectDelay(attempt));
    expect(delays.slice(0, 6)).toEqual([250, 500, 1000, 2000, 4000, 5000]);
    expect(delays).toEqual(delays.toSorted((a, b) => a - b));
    expect(reconnectDelay(Number.MAX_SAFE_INTEGER)).toBe(5000);
  });
  it('escalates after six failed retries and resets on success', () => {
    expect(connectionPhase(RECONNECT_ESCALATION_ATTEMPTS - 1, false)).toBe('reconnecting');
    expect(connectionPhase(RECONNECT_ESCALATION_ATTEMPTS, false)).toBe('escalated');
    expect(connectionPhase(100, true)).toBe('connected');
  });
});
