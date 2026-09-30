import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { TAB_PLUGIN_API_VERSION, type TabPluginActivation, type TabPluginDeclaration } from './api.js';
import { createPluginContext } from './context.js';

// What the feed is told is the whole of what `notifyUser` decides, so the host's `notify` is the
// thing recorded: which tab a line is attributed to is its third argument.
const notify = vi.fn();
vi.mock('../notifications/index.js', () => ({ notify: (...args: unknown[]) => notify(...args) }));

const declaration: TabPluginDeclaration = {
  id: 'sql', version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION, payloadSchemaVersion: 1,
  tabLabelPrefix: 'sql', fileExtensions: {}, capabilities: ['notifyUser'],
};

const activation: TabPluginActivation = {
  isPayload: () => true, intent: () => null, opener: { inline: () => {}, external: () => {} },
};

// The plugin's own tab, and another plugin's that happens to use the same instance key. The pair is
// the one `addPluginTab` produces: a label derived from the prefix, and the title the payload
// supplied. Handing this fixture a `label: 'shop'` — as it once did — pinned a value the
// application can never hold, so nothing here could notice the two coming apart.
const tabs = [
  { label: 'sql', title: 'shop', plugin: { id: 'sql', instanceKey: 'sqlite:shop' } },
  { label: 'player', title: 'blog', plugin: { id: 'audio', instanceKey: 'sqlite:blog' } },
];

const managers = {
  tab: {
    tabs,
    pluginTabByInstanceKey: (id: string, key: string) =>
      tabs.find((tab) => tab.plugin.id === id && tab.plugin.instanceKey === key),
  },
} as unknown as Managers;

/** The capabilities a plugin call gets, invoked from `origin` — empty for a topic notification. */
function capabilitiesFrom(label: string) {
  return createPluginContext(managers, declaration, activation, { label, command: '' }, () => true);
}

beforeEach(() => { notify.mockClear(); });

describe('notifyUser', () => {
  it('attributes a line to the tab it was invoked from', () => {
    capabilitiesFrom('janus').notifyUser('Dropped a.mp3.');
    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'Dropped a.mp3.', {});
  });

  // A topic notification has no invoking tab, so without naming one the line is attributed to
  // nothing and reads without a tab name or a colour. What it hands on is the tab's *label* — which
  // tab the line is about — because the name it reads as is `notify`'s to derive from the label.
  it('attributes a line to one of the plugin\'s own tabs when it names one', () => {
    capabilitiesFrom('').notifyUser('3 rows changed.', { tab: 'sqlite:shop' });
    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'sql', '3 rows changed.', {});
  });

  it('carries the file alongside the tab it names', () => {
    capabilitiesFrom('').notifyUser('Query returned 9 rows.', { tab: 'sqlite:shop', openFile: '/tmp/result.txt' });
    expect(notify).toHaveBeenCalledWith(
      managers, 'plugin-note', 'sql', 'Query returned 9 rows.', { openFile: '/tmp/result.txt' },
    );
  });

  // A closed tab is the ordinary case for a plugin that never tracks what the user closed.
  it('falls back to the invoking tab when the plugin has no tab under that key', () => {
    capabilitiesFrom('janus').notifyUser('OK.', { tab: 'sqlite:gone' });
    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'OK.', {});
  });

  it('never attributes a line to a tab another plugin owns', () => {
    capabilitiesFrom('janus').notifyUser('OK.', { tab: 'sqlite:blog' });
    expect(notify).toHaveBeenCalledWith(managers, 'plugin-note', 'janus', 'OK.', {});
  });
});
