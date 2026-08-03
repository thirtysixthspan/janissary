import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { tabPluginCatalog } from '../plugins/catalog.js';
import type { TabPluginStatus } from '../plugins/host.js';
import { command } from './plugins.js';

function run(status: TabPluginStatus) {
  const append = vi.fn();
  const runOpener = vi.fn();
  const managers = {
    tab: { append },
    plugins: { declarations: tabPluginCatalog, statusFor: vi.fn(() => status), runOpener },
  } as unknown as Managers;
  command.run('plugins', { label: 'janus', index: 0 }, managers);
  return { append, managers, runOpener };
}

describe('plugins command', () => {
  it.each([
    [{ state: 'declared' }, 'video 1.0.0 api=1 state=declared'],
    [{ state: 'active', activationMs: 7 }, 'video 1.0.0 api=1 state=active activation=7ms'],
    [{ state: 'disabled', reason: 'chunk rejected' }, 'video 1.0.0 api=1 state=disabled reason=chunk rejected'],
  ] satisfies Array<[TabPluginStatus, string]>)('prints the catalog status %#', (status, expected) => {
    const fixture = run(status);
    expect(fixture.append).toHaveBeenCalledWith('janus', { input: 'plugins', output: expected });
  });

  it('reads status without activating or running a plugin', () => {
    const fixture = run({ state: 'declared' });
    expect(fixture.managers.plugins.statusFor).toHaveBeenCalledWith('video');
    expect(fixture.runOpener).not.toHaveBeenCalled();
  });

  it('rejects arguments without reading plugin status', () => {
    const fixture = run({ state: 'declared' });
    fixture.append.mockClear();
    command.run('plugins video', { label: 'janus', index: 0 }, fixture.managers);
    // Only the first, argument-free run read status — once per catalog entry.
    expect(fixture.managers.plugins.statusFor).toHaveBeenCalledTimes(tabPluginCatalog.length);
    expect(fixture.append).toHaveBeenCalledWith('janus', {
      input: 'plugins video', output: 'Usage: plugins',
    });
  });
});
