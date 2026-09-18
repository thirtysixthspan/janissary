import { describe, expect, it } from 'vitest';
import { clientParamsValid } from './index.js';

// The ingress boundary answers a malformed request rather than dropping it, so a client a version
// behind gets an error naming the method instead of silence. Every field the dispatcher will read is
// checked here, which is what lets the arm read them at their declared types.

describe('remoteSession params', () => {
  it.each(['detach', 'reattach'])('accepts the %s verb with a label', (action) => {
    expect(clientParamsValid('remoteSession', { action, label: 'claude' })).toBe(true);
  });

  // The declared type of `action` is a literal union, so checking the type is checking membership.
  it('refuses a verb outside the two', () => {
    expect(clientParamsValid('remoteSession', { action: 'explode', label: 'claude' })).toBe(false);
  });

  it('refuses a missing or mistyped label', () => {
    expect(clientParamsValid('remoteSession', { action: 'detach' })).toBe(false);
    expect(clientParamsValid('remoteSession', { action: 'detach', label: 7 })).toBe(false);
  });

  it('refuses a missing verb', () => {
    expect(clientParamsValid('remoteSession', { label: 'claude' })).toBe(false);
  });

  // An extra key a client a version ahead happens to send is accepted: the dispatcher never reads a
  // key it does not know, and refusing one would only stop that client talking at all.
  it('accepts an unknown extra key', () => {
    expect(clientParamsValid('remoteSession', { action: 'detach', label: 'claude', why: 'x' })).toBe(true);
  });

  it('refuses params that are not an object at all', () => {
    expect(clientParamsValid('remoteSession', null)).toBe(false);
    expect(clientParamsValid('remoteSession', ['detach'])).toBe(false);
  });
});
