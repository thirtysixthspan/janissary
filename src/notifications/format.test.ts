import { describe, it, expect } from 'vitest';
import { formatTimestamp, provenanceTimestamp, notificationText } from './format.js';

describe('formatTimestamp', () => {
  it('renders afternoon times in 12-hour form with pm', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 20, 32, 0))).toBe('8:32pm');
  });

  it('renders morning times with am and no leading zero on the hour', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 9, 5, 0))).toBe('9:05am');
  });

  it('renders the midnight hour as 12am', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 0, 15, 0))).toBe('12:15am');
  });

  it('renders noon as 12pm', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 12, 0, 0))).toBe('12:00pm');
  });

  it('renders one minute before midnight as 11:59pm', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 23, 59, 0))).toBe('11:59pm');
  });
});

describe('provenanceTimestamp', () => {
  const now = new Date(2026, 0, 1, 20, 32, 0);

  it('renders the bare time for a detection on today\'s calendar day', () => {
    expect(provenanceTimestamp(new Date(2026, 0, 1, 9, 5, 0), now)).toBe('9:05am');
  });

  it('dates a detection from an earlier calendar day', () => {
    expect(provenanceTimestamp(new Date(2025, 11, 28, 9, 5, 0), now)).toBe('Dec 28 9:05am');
  });

  // The comparison is calendar day, not elapsed hours, so 11pm last night is dated even though it
  // is only a few hours old.
  it('dates a detection from late the previous night', () => {
    expect(provenanceTimestamp(new Date(2025, 11, 31, 23, 0, 0), now)).toBe('Dec 31 11:00pm');
  });
});

describe('notificationText', () => {
  it('returns the bare message for a manual event (the label lives in the header)', () => {
    expect(notificationText('manual', 'janus', 'this is a notification')).toBe('this is a notification');
  });

  it('is unchanged for ambient events', () => {
    expect(notificationText('state-change', 'janus')).toBe("Agent 'janus' finished");
  });

  it('renders agent-start event text', () => {
    expect(notificationText('agent-start', 'build')).toBe("Agent 'build' started");
  });

  it('renders schedule-fire event text with the detail and tab', () => {
    expect(notificationText('schedule-fire', 'build', 'deploy')).toBe('Scheduled: deploy in build');
  });

  it('renders rate-limited event text', () => {
    expect(notificationText('rate-limited', 'build')).toBe("Agent 'build' is being rate limited");
  });

  it('renders the incoming-message body with the sender and the tab', () => {
    expect(notificationText('incoming-message', 'bob', 'janus')).toBe('Message from janus in bob');
  });

  it('formats the waiting-agent message', () => {
    expect(notificationText('question', 'build')).toBe('Question from build');
  });

  it.each([
    ['transcript-unavailable', 'no harness transcript found'],
    ['ssh-recording-failed', 'ssh recording failed'],
    ['harness-recording-failed', 'harness recording failed'],
  ] as const)('renders the fixed body for %s', (event, text) => {
    expect(notificationText(event, 'claude')).toBe(text);
  });

  it('renders the reported detail as the e2e-browser-gone body', () => {
    expect(notificationText('e2e-browser-gone', 'claude', 'e2e browser exited')).toBe('e2e browser exited');
  });

  it('falls back to a fixed e2e-browser-gone body when no detail is given', () => {
    expect(notificationText('e2e-browser-gone', 'claude')).toBe('e2e browser stopped');
  });

  it.each([
    ['launch-refused', 'Cannot launch "foo": a tab named "foo" is already open.'],
    ['launch-workspace-cleaned', 'Removed leftover workspace "foo" (/p/.janissary/workspace/foo) before launching.'],
  ] as const)('renders the %s message verbatim', (event, text) => {
    expect(notificationText(event, 'janus', text)).toBe(text);
  });
});
