import { describe, expect, it } from 'vitest';
import type { TabView } from '@shared/protocol';
import { hostsCommandBar } from './hosts-command-bar';

function tab(fields: Partial<TabView>): TabView {
  return { label: 't', ...fields } as TabView;
}

describe('hostsCommandBar', () => {
  it('is true for a plugin tab whose view carries the declared flag, whatever the plugin id', () => {
    expect(hostsCommandBar(tab({
      view: 'plugin', plugin: { id: 'terminal', schemaVersion: 1, payload: {}, hostsCommandBar: true },
    }))).toBe(true);
  });

  it('is false for the shell id without the flag, so the id alone decides nothing', () => {
    expect(hostsCommandBar(tab({ view: 'plugin', plugin: { id: 'shell', schemaVersion: 2, payload: {} } }))).toBe(false);
  });

  it('is false for a non-plugin tab and for no tab at all', () => {
    expect(hostsCommandBar(tab({ view: 'agent' }))).toBe(false);
    expect(hostsCommandBar(undefined)).toBe(false);
  });
});
