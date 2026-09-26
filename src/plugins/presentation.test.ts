import { describe, expect, it, vi } from 'vitest';
import { openerPresentation } from './presentation.js';
import type { TabPluginActivation, TabPluginOpener } from './api.js';

function activationWith(opener: Partial<TabPluginOpener>): TabPluginActivation {
  return { opener: { inline: vi.fn(), external: vi.fn(), ...opener } } as unknown as TabPluginActivation;
}

const capabilities = {} as never;

describe('openerPresentation', () => {
  it('answers the handler behind a verb the activation supplies', async () => {
    const inline = vi.fn();
    const presented = openerPresentation('fixture', activationWith({ inline }), 'inline');
    await presented('a.fixture', capabilities);
    expect(inline).toHaveBeenCalledWith('a.fixture', capabilities);
  });

  it('answers the external handler when asked for it', async () => {
    const external = vi.fn();
    const presented = openerPresentation('fixture', activationWith({ external }), 'external');
    await presented('a.fixture', capabilities);
    expect(external).toHaveBeenCalledWith('a.fixture', capabilities);
  });

  it('answers the edit handler when the activation supplies one', async () => {
    const edit = vi.fn();
    const presented = openerPresentation('fixture', activationWith({ edit }), 'edit');
    await presented('a.fixture', capabilities);
    expect(edit).toHaveBeenCalledWith('a.fixture', capabilities);
  });

  // `validateActivation` already refuses a declaration that claims `edit` without supplying one, so
  // reaching this is a host bug. It is the host's own rejection rather than the plugin's
  // `rejectRequest` because attributing it to the plugin would turn "no handler" into a capability
  // violation against a plugin that may never have declared that capability.
  it('rejects with the plugin id and the verb when the activation supplies no handler', () => {
    const presented = () => openerPresentation('fixture', activationWith({}), 'edit');
    expect(presented).toThrow('Tab plugin "fixture" provides no edit presentation');
  });

  it('names the verb it was asked for, not a fixed one', () => {
    const bare = { opener: {} } as unknown as TabPluginActivation;
    expect(() => openerPresentation('commenting', bare, 'inline')).toThrow('provides no inline');
    expect(() => openerPresentation('commenting', bare, 'external'))
      .toThrow('Tab plugin "commenting" provides no external presentation');
  });
});
