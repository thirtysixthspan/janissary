import { describe, it, expect, beforeEach } from 'vitest';
import { TabManager } from '../tab-manager.js';
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
    expect(feed(managers)).toContain('janus: deploy finished');
  });

  it('is a no-op (drops the message, creates nothing) when the notifications tab is closed', () => {
    const before = managers.tab.tabs.length;
    command.run('notify deploy finished', { label: 'janus', index: 0 }, managers);
    expect(notificationsTab(managers)).toBeUndefined();
    expect(managers.tab.tabs).toHaveLength(before);
  });

  it('fires even when the issuing tab is the active tab (bypasses focus suppression)', () => {
    openNotificationsTab(managers);
    managers.tab.setActiveTab(managers.tab.findIndex('janus'));
    command.run('notify heads up', { label: 'janus', index: 0 }, managers);
    expect(feed(managers)).toContain('janus: heads up');
  });

  it('appends a usage error to the issuing tab for an empty message and records nothing in the feed', () => {
    openNotificationsTab(managers);
    command.run('notify', { label: 'janus', index: 0 }, managers);
    expect(janusLog(managers)).toContain('Usage: notify <message>.');
    expect(feed(managers)).toHaveLength(0);
  });
});
