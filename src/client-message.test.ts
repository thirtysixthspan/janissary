import { describe, expect, it } from 'vitest';
import {
  CLIENT_METHOD_CONTRACTS, clientParamsProblem, clientReplyMode, isClientMessage,
} from './client-message.js';
import { isPluginFailedParams, isPluginIntentParams } from './client-params/plugin.js';
import { isTerminalColors } from './harness/terminal-colors.js';
import type { ClientMessage } from './protocol.js';

describe('isClientMessage', () => {
  it('accepts a recognized RPC envelope with object params', () => {
    expect(isClientMessage({
      t: 'rpc',
      id: 1,
      method: 'command',
      params: { text: 'help' },
    })).toBe(true);
  });

  it.each([
    ['core-rpc', 'command', { text: 'help' }],
    ['file-navigator', 'fileNavigatorCollapseAll', { index: 0 }],
    ['editor', 'editorSync', { url: '/open/1', content: 'x' }],
    ['monitor', 'runSuggestion', { id: 's1' }],
    ['schedule', 'closeScheduleLaunch', {}],
    ['plugin', 'pluginIntent', { tab: 'fixture', intent: 'echo', payload: {} }],
  ])('accepts a %s method, so that domain stays wired into the RpcCall union', (_domain, method, params) => {
    expect(isClientMessage({ t: 'rpc', id: 1, method, params })).toBe(true);
  });

  it.each([
    null,
    [],
    'rpc',
    { t: 'event', id: 1, method: 'command', params: {} },
    { t: 'rpc', id: '1', method: 'command', params: {} },
    { t: 'rpc', id: 1, method: 'unknown', params: {} },
    { t: 'rpc', id: 1, method: 'command' },
    { t: 'rpc', id: 1, method: 'command', params: null },
    { t: 'rpc', id: 1, method: 'command', params: [] },
    { t: 'rpc', id: 1, method: 'command', params: 'help' },
  ])('rejects an invalid envelope %#', (value) => {
    expect(isClientMessage(value)).toBe(false);
  });

  it('declares the complete result and deferred reply method sets', () => {
    const methodsByMode = Object.groupBy(
      Object.entries(CLIENT_METHOD_CONTRACTS),
      ([, mode]) => mode,
    );

    expect(methodsByMode.result?.map(([method]) => method)).toEqual([
      'complete',
      'defaultMenuSelectionAction',
      'deleteFileNavigatorItems',
      'editorPersonas',
      'fileNavigatorOpeners',
      'fileNavigatorSelectionAction',
      'moveFileNavigatorItem',
      'moveFileNavigatorItems',
      'pasteFileNavigatorItems',
      'redoFileNavigatorItem',
      'remoteSession',
      'renameFileNavigatorItem',
      'undoFileNavigatorItem',
    ]);
    expect(methodsByMode.deferred?.map(([method]) => method)).toEqual([
      'editorSuggest',
      'fileNavigatorOpen',
      'fileNavigatorCreateFile',
      'fileNavigatorCreateDirectory',
      'fileNavigatorSearch',
      'projectFiles',
      'pluginIntent',
    ]);
    expect(clientReplyMode('command')).toBe('ack');
    expect(clientReplyMode('unknown')).toBeUndefined();
  });
});

describe('clientParamsProblem', () => {
  const message = (method: string, params: unknown) =>
    ({ t: 'rpc', id: 1, method, params } as unknown as ClientMessage);

  // The envelope check used to be the whole boundary: a known method name and an object for
  // `params` was enough, and the dispatcher then read each field at its declared type.
  it.each([
    ['a string where reportLayout declares a number', 'reportLayout', { sidebarLeft: '240', sidebarRight: 300, tabAreaPct: 62 }],
    ['a missing saveFile content', 'saveFile', { url: '/open/1' }],
    ['a null editorSync url', 'editorSync', { url: null, content: 'x' }],
    ['a string renameTab index', 'renameTab', { index: '0', title: 'one' }],
    ['a dir outside moveTab\'s union', 'moveTab', { dir: 0 }],
    ['a command params with no text', 'command', {}],
    ['a missing terminal color', 'reportTerminalColors', { id: 'pty-1', fg: '#fff' }],
    ['a non-string terminal color', 'reportTerminalColors', { id: 'pty-1', fg: 0, bg: '#17181b' }],
  ])('names the method for %s', (_case, method, params) => {
    expect(clientParamsProblem(message(method, params))).toBe(`Invalid ${method} params`);
  });

  it.each([
    ['command', { text: 'help' }],
    ['reportLayout', { sidebarLeft: 240, sidebarRight: 300, tabAreaPct: 62.5 }],
    ['reportTerminalColors', { id: 'pty-1', fg: '#e4e5e7', bg: '#17181b' }],
    ['init', {}],
  ])('reports no problem for well-typed %s params', (method, params) => {
    expect(clientParamsProblem(message(method, params))).toBeUndefined();
  });

  // Shape is all this decoder checks; the values are held to being colors where they are used, since
  // that is where a bad one would matter and where the refusal can be answered rather than dropped.
  // Padded hex is accepted on purpose: a computed custom property comes back with its whitespace.
  it.each([
    ['a named color', 'red', false],
    ['an rgb() function', 'rgb(1, 2, 3)', false],
    ['an empty string', '', false],
    ['a leading space on a hex color', ' #fff', true],
    ['six digits', '#ffffff', true],
    ['three digits', '#fff', true],
    ['an alpha pair', '#ffffffff', true],
    ['a missing hash', 'fff', false],
  ])('accepts %s only where it is a plain color', (_case, color, accepted) => {
    expect(isTerminalColors({ fg: color, bg: '#17181b' })).toBe(accepted);
  });

  it('refuses a colors payload that is not a pair of strings', () => {
    expect(isTerminalColors(null)).toBe(false);
    expect(isTerminalColors(['#fff', '#000'])).toBe(false);
    expect(isTerminalColors({ fg: '#fff' })).toBe(false);
  });

  // The envelope and the params are separate failures with separate answers: one is dropped, the
  // other is told what was wrong with it.
  it('is asked only of envelopes that already passed the envelope check', () => {
    expect(isClientMessage({ t: 'rpc', id: 1, method: 'command', params: { text: 7 } })).toBe(true);
  });
});

describe('plugin RPC guards', () => {
  it('validates every plugin intent field and requires a payload key', () => {
    expect(isPluginIntentParams({ tab: 'fixture', intent: 'echo', payload: { value: 1 } })).toBe(true);
    expect(isPluginIntentParams({ tab: 'fixture', intent: 'echo', payload: null })).toBe(true);
    for (const value of [
      null,
      [],
      { tab: 'fixture', intent: 'echo' },
      { tab: 1, intent: 'echo', payload: {} },
      { tab: 'fixture', intent: [], payload: {} },
    ]) expect(isPluginIntentParams(value)).toBe(false);
  });

  it('validates every plugin failure field', () => {
    expect(isPluginFailedParams({ tab: 'fixture', reason: 'render failed' })).toBe(true);
    for (const value of [
      null,
      [],
      { tab: 'fixture' },
      { tab: 1, reason: 'failed' },
      { tab: 'fixture', reason: { message: 'failed' } },
    ]) expect(isPluginFailedParams(value)).toBe(false);
  });

  it('recognizes both generic plugin methods and no video-specific method', () => {
    expect(isClientMessage({
      t: 'rpc', id: 1, method: 'pluginIntent', params: { tab: 'fixture', intent: 'echo', payload: {} },
    })).toBe(true);
    expect(isClientMessage({
      t: 'rpc', id: 2, method: 'pluginFailed', params: { tab: 'fixture', reason: 'failed' },
    })).toBe(true);
    expect(isClientMessage({
      t: 'rpc', id: 3, method: 'captureVideoFrame', params: {},
    })).toBe(false);
  });
});
