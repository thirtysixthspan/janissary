import { describe, it, expect } from 'vitest';
import type { NotificationConfig } from './types.js';
import { shouldNotify } from './notifications.js';
import { NOTIFICATIONS_LABEL } from './notifications-tab.js';

const allOn: NotificationConfig = {
  events: { stateChange: true, incomingMessage: true, scheduleFire: true, agentStart: true },
};
const allOff: NotificationConfig = {
  events: { stateChange: false, incomingMessage: false, scheduleFire: false, agentStart: false },
};

describe('shouldNotify — ambient events', () => {
  it('fires for a background tab when its event toggle is on', () => {
    expect(shouldNotify(allOn, 'state-change', 'build', 'janus')).toBe(true);
  });

  it('is suppressed for the currently active tab (focus suppression)', () => {
    expect(shouldNotify(allOn, 'state-change', 'janus', 'janus')).toBe(false);
  });

  it('is suppressed when the event toggle is off', () => {
    expect(shouldNotify(allOff, 'incoming-message', 'build', 'janus')).toBe(false);
  });

  it('is suppressed for the notifications tab\'s own label', () => {
    expect(shouldNotify(allOn, 'state-change', NOTIFICATIONS_LABEL, 'janus')).toBe(false);
  });

  it('is suppressed when the config is undefined', () => {
    expect(shouldNotify(undefined, 'agent-start', 'build', 'janus')).toBe(false);
  });
});

describe('shouldNotify — manual event', () => {
  it('fires even when the issuing tab is active', () => {
    expect(shouldNotify(allOn, 'manual', 'janus', 'janus')).toBe(true);
  });

  it('fires regardless of the per-event toggles', () => {
    expect(shouldNotify(allOff, 'manual', 'build', 'janus')).toBe(true);
  });

  it('still never targets the notifications tab itself', () => {
    expect(shouldNotify(allOff, 'manual', NOTIFICATIONS_LABEL, 'janus')).toBe(false);
  });
});
