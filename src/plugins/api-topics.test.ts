import { describe, expect, it } from 'vitest';
import { isTabPluginNotificationTopic, TAB_PLUGIN_NOTIFICATION_TOPICS } from './api-topics.js';

// The keyed record exists so a topic cannot be added to the union without a source behind it — a
// name the host would silently never deliver. This pins the record against the union so the two
// cannot drift apart unnoticed.
describe('the notification topic record', () => {
  it('carries every topic the union names, and the database topic with them', () => {
    expect(TAB_PLUGIN_NOTIFICATION_TOPICS).toEqual(['schedules', 'conversations', 'sessions', 'databases']);
  });

  it('recognises the database topic, and refuses a name that is not one', () => {
    expect(isTabPluginNotificationTopic('databases')).toBe(true);
    expect(isTabPluginNotificationTopic('schedules')).toBe(true);
    expect(isTabPluginNotificationTopic('transcript')).toBe(false);
  });
});
