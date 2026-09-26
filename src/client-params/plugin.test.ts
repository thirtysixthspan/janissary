import { describe, expect, it } from 'vitest';
import { clientParamsValid } from './index.js';
import { isPluginFailedParams, isPluginIntentParams } from './plugin.js';

// The ingress boundary answers a malformed request rather than dropping it, so a client a version
// behind gets an error naming the method instead of silence. Every field the dispatcher will read is
// checked here, which is what lets the arm read them at their declared types.

describe('defaultMenuSelectionAction params', () => {
  it('accepts a selection', () => {
    expect(clientParamsValid('defaultMenuSelectionAction', { selection: 'first' })).toBe(true);
  });

  it('refuses a missing or mistyped selection', () => {
    expect(clientParamsValid('defaultMenuSelectionAction', {})).toBe(false);
    expect(clientParamsValid('defaultMenuSelectionAction', { selection: 7 })).toBe(false);
  });
});

describe('runDefaultMenuSelectionAction params', () => {
  it('accepts a selection with the action to run on it', () => {
    expect(clientParamsValid('runDefaultMenuSelectionAction', { selection: 'first', action: 'open' }))
      .toBe(true);
  });

  it('refuses a selection with no action to run', () => {
    expect(clientParamsValid('runDefaultMenuSelectionAction', { selection: 'first' })).toBe(false);
  });

  it('refuses an action with no selection to run it on', () => {
    expect(clientParamsValid('runDefaultMenuSelectionAction', { action: 'open' })).toBe(false);
  });

  it('refuses a mistyped selection or action', () => {
    expect(clientParamsValid('runDefaultMenuSelectionAction', { selection: 7, action: 'open' })).toBe(false);
    expect(clientParamsValid('runDefaultMenuSelectionAction', { selection: 'first', action: 7 })).toBe(false);
  });
});

describe('pluginIntent params', () => {
  // `payload` is the plugin's own contract, so the check is presence rather than shape: what it holds
  // is the plugin's to validate, and refusing here would stop a plugin from ever being reached.
  it('accepts a tab, an intent, and a payload of any shape', () => {
    expect(clientParamsValid('pluginIntent', { tab: 'files-1', intent: 'queue', payload: { a: 1 } })).toBe(true);
    expect(clientParamsValid('pluginIntent', { tab: 'files-1', intent: 'queue', payload: null })).toBe(true);
  });

  it('refuses a payload that is absent entirely', () => {
    expect(isPluginIntentParams({ tab: 'files-1', intent: 'queue' })).toBe(false);
  });

  it('refuses a missing or mistyped tab or intent', () => {
    expect(clientParamsValid('pluginIntent', { intent: 'queue', payload: {} })).toBe(false);
    expect(clientParamsValid('pluginIntent', { tab: 7, intent: 'queue', payload: {} })).toBe(false);
    expect(clientParamsValid('pluginIntent', { tab: 'files-1', payload: {} })).toBe(false);
    expect(clientParamsValid('pluginIntent', { tab: 'files-1', intent: 7, payload: {} })).toBe(false);
  });

  it('refuses params that are not an object at all', () => {
    expect(clientParamsValid('pluginIntent', 'queue')).toBe(false);
    expect(clientParamsValid('pluginIntent', ['queue'])).toBe(false);
  });
});

describe('pluginFailed params', () => {
  it('accepts a tab with the reason the plugin failed', () => {
    expect(clientParamsValid('pluginFailed', { tab: 'files-1', reason: 'exports no handler' })).toBe(true);
  });

  it('refuses a missing or mistyped tab or reason', () => {
    expect(clientParamsValid('pluginFailed', { reason: 'broke' })).toBe(false);
    expect(clientParamsValid('pluginFailed', { tab: 7, reason: 'broke' })).toBe(false);
    expect(clientParamsValid('pluginFailed', { tab: 'files-1' })).toBe(false);
    expect(clientParamsValid('pluginFailed', { tab: 'files-1', reason: 7 })).toBe(false);
  });

  it('refuses params that are not an object at all', () => {
    expect(isPluginFailedParams(null)).toBe(false);
    expect(isPluginFailedParams('broke')).toBe(false);
  });
});
