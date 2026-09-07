import { describe, expect, it } from 'vitest';
import { EDITOR_PARAMS, isEditorPluginFailedParams } from './editor.js';
import { MONITOR_PARAMS } from './monitor.js';
import { PLUGIN_PARAMS } from './plugin.js';

const EDITOR_CASES: Array<[keyof typeof EDITOR_PARAMS, Record<string, unknown>, Array<Record<string, unknown>>]> = [
  ['saveFile', { url: '/open/1', content: 'x' }, [{ url: '/open/1' }, { url: '/open/1', content: 7 }]],
  ['editorSync', { url: '/open/1', content: '' }, [{ content: '' }, { url: null, content: '' }]],
  ['resyncEditorTab', { url: '/open/1' }, [{}, { url: 1 }]],
  ['editorSuggest', { url: '/open/1', persona: 'critic', content: 'x', prompt: 'y' }, [
    { url: '/open/1', persona: 'critic', content: 'x' },
    { url: '/open/1', persona: 7, content: 'x', prompt: 'y' },
  ]],
  ['closeEditorConnection', { url: '/open/1', persona: 'critic' }, [{ url: '/open/1' }]],
  ['editorPluginFailed', { url: '/open/1', plugin: 'vim', reason: 'boom' }, [
    { url: '/open/1', plugin: 'vim' },
    { url: '/open/1', plugin: 'vim', reason: {} },
  ]],
];

const MONITOR_CASES: Array<[keyof typeof MONITOR_PARAMS, Record<string, unknown>, Array<Record<string, unknown>>]> = [
  ['runSuggestion', { id: 's1' }, [{}, { id: 1 }]],
  ['rateSuggestion', { id: 's1', up: false }, [{ id: 's1' }, { id: 's1', up: 'yes' }]],
  ['resetMonitorContext', { name: 'watch' }, [{}, { name: [] }]],
  ['monitorContextSnapshot', { name: 'watch' }, [{ name: null }]],
];

describe('editor RPC params decoders', () => {
  it.each(EDITOR_CASES)('accepts the %s params the client sends', (method, valid) => {
    expect(EDITOR_PARAMS[method](valid)).toBe(true);
  });

  it.each(EDITOR_CASES)('rejects malformed %s params', (method, _valid, invalid) => {
    for (const params of invalid) expect(EDITOR_PARAMS[method](params)).toBe(false);
  });

  it('exposes the editor-plugin guard the dispatcher re-checks with', () => {
    expect(isEditorPluginFailedParams({ url: 'u', plugin: 'p', reason: 'r' })).toBe(true);
    expect(isEditorPluginFailedParams(null)).toBe(false);
  });
});

describe('monitor RPC params decoders', () => {
  it.each(MONITOR_CASES)('accepts the %s params the client sends', (method, valid) => {
    expect(MONITOR_PARAMS[method](valid)).toBe(true);
  });

  it.each(MONITOR_CASES)('rejects malformed %s params', (method, _valid, invalid) => {
    for (const params of invalid) expect(MONITOR_PARAMS[method](params)).toBe(false);
  });
});

describe('plugin RPC params decoders', () => {
  // `payload` is `unknown` by design — a plugin's intent body is its own contract — so the decoder
  // requires the key to be present rather than checking what it holds.
  it('requires a payload key on an intent without constraining its value', () => {
    expect(PLUGIN_PARAMS.pluginIntent({ tab: 't', intent: 'echo', payload: null })).toBe(true);
    expect(PLUGIN_PARAMS.pluginIntent({ tab: 't', intent: 'echo' })).toBe(false);
  });

  it('requires both fields of a plugin failure', () => {
    expect(PLUGIN_PARAMS.pluginFailed({ tab: 't', reason: 'boom' })).toBe(true);
    expect(PLUGIN_PARAMS.pluginFailed({ tab: 't' })).toBe(false);
  });
});
