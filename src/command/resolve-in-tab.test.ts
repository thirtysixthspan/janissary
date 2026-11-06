import { describe, expect, it } from 'vitest';
import type { Managers } from '../managers.js';
import { makeHarnessTab, makePluginTab } from '../tab/index.js';
import type { PluginTabRecord, Tab } from '../tab/types.js';
import { resolveInTab } from './resolve-in-tab.js';

const shellPlugin = (sourceLabel: string): PluginTabRecord => ({
  id: 'shell', instanceKey: 'shell-instance', schemaVersion: 2, payload: {}, fileRefs: [], sourceLabel,
});

function shellTab(label: string): Tab {
  return makePluginTab(label, '#fff', 1, 1, '#fff', 'Shell', shellPlugin(label));
}

function managersFor(tab: Tab): Managers {
  return {
    tab: { byLabel: () => tab },
    plugins: { declarations: [{ id: 'shell', capabilities: ['promptAcp'] }] },
  } as unknown as Managers;
}

describe('tell command availability', () => {
  it.each(['tell hello', 'tell reset'])('resolves %s on a local shell plugin tab', (input) => {
    const tab = shellTab('local-shell');

    expect(resolveInTab(input, tab.label, managersFor(tab))).toMatchObject({ kind: 'app' });
  });

  it.each(['tell hello', 'tell reset'])('resolves %s on a remote shell plugin tab', (input) => {
    const tab = shellTab('remote-shell');
    tab.remote = { address: 'host:/repo', host: 'host' };

    expect(resolveInTab(input, tab.label, managersFor(tab))).toMatchObject({ kind: 'app' });
  });

  it.each(['tell', 'tell reset'])('keeps %s unavailable on a harness tab', (input) => {
    const tab = makeHarnessTab('harness', '#fff', 1, 1, '#fff', {
      name: 'claude', program: 'claude', ptyId: 'pty-1', status: 'running',
    });

    expect(resolveInTab(input, tab.label, managersFor(tab))).toMatchObject({
      kind: 'unknown', cmd: input, output: `Unknown command: "${input}". Type "help" for available commands.`,
    });
  });
});
