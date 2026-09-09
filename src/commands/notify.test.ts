import { describe, it, expect, beforeEach } from 'vitest';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import { openNotificationsTab, notificationsTab } from '../notifications-tab.js';
import { command } from './notify.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

const feed = (managers: Managers) => notificationsTab(managers)?.log.map((e) => e.output) ?? [];
const janusLog = (managers: Managers) =>
  managers.tab.tabs.find((t) => t.label === 'janus')!.log.map((e) => e.output);

describe('notify command', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('appends an attributed line to the feed when the notifications tab is open', () => {
    openNotificationsTab(managers);
    command.run('notify deploy finished', { label: 'janus', index: 0 }, managers);
    const entries = notificationsTab(managers)!.log;
    expect(entries.some((e) => e.output === 'deploy finished' && !!e.from?.endsWith('janus'))).toBe(true);
  });

  it('opens the feed docked right and posts into it when the notifications tab is closed', () => {
    command.run('notify deploy finished', { label: 'janus', index: 0 }, managers);
    const feed = notificationsTab(managers);
    expect(feed?.dock).toBe('right');
    expect(feed!.log.some((e) => e.output === 'deploy finished')).toBe(true);
  });

  it('fires even when the issuing tab is the active tab (bypasses focus suppression)', () => {
    openNotificationsTab(managers);
    managers.tab.setActiveTab(managers.tab.findIndex('janus'));
    command.run('notify heads up', { label: 'janus', index: 0 }, managers);
    const entries = notificationsTab(managers)!.log;
    expect(entries.some((e) => e.output === 'heads up' && !!e.from?.endsWith('janus'))).toBe(true);
  });

  it('appends a usage error to the issuing tab for an empty message and records nothing in the feed', () => {
    openNotificationsTab(managers);
    command.run('notify', { label: 'janus', index: 0 }, managers);
    expect(janusLog(managers)).toContain('Usage: notify <message>.');
    expect(feed(managers)).toHaveLength(0);
  });
});
