import { describe, expect, it } from 'vitest';
import { CLIENT_METHOD_CONTRACTS } from '../client-message.js';
import { CLIENT_PARAMS_DECODERS, clientParamsValid } from './index.js';
import type { ClientMessage } from '../protocol.js';

// The seven methods declaring `params: Record<string, never>`; their dispatch arms read nothing.
const NO_PARAMS_METHODS = [
  'init', 'toggleCollapse', 'promoteToTerminal', 'closeHarnessLaunch',
  'projectFiles', 'editorPersonas', 'closeScheduleLaunch',
] as const;

describe('the client params decoder table', () => {
  // The typed domain tables make an omission a compile error; this is the runtime half, so a table
  // assembled from the wrong spread is caught even if the types were widened.
  it('holds exactly one decoder per contracted method', () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(CLIENT_PARAMS_DECODERS).toSorted(byName))
      .toEqual(Object.keys(CLIENT_METHOD_CONTRACTS).toSorted(byName));
  });

  it.each(NO_PARAMS_METHODS)('accepts any object for %s, which reads no params', (method) => {
    expect(clientParamsValid(method, {})).toBe(true);
    expect(clientParamsValid(method, { stray: 1 })).toBe(true);
  });

  // A decoder answers "is every field the dispatcher reads of its declared type", not "is this
  // object exactly this shape" — a client one version ahead must still be able to talk.
  it('accepts an extra unknown key alongside well-typed fields', () => {
    expect(clientParamsValid('renameTab', { index: 0, title: 'one', future: true })).toBe(true);
  });

  // The four whose params outlive the call: they are stored, saved into a profile, or written to
  // disk, so a wrong type here is what surfaces later as an unloadable profile or a bad write.
  it.each([
    ['reportLayout', { sidebarLeft: 240, sidebarRight: 300, tabAreaPct: 62.5 }, { sidebarLeft: '240', sidebarRight: 300, tabAreaPct: 62.5 }],
    ['saveFile', { url: '/open/1', content: 'x' }, { url: '/open/1', content: 7 }],
    ['editorSync', { url: '/open/1', content: '' }, { url: null, content: '' }],
    ['renameTab', { index: 2, title: 'one' }, { index: '2', title: 'one' }],
  ] as Array<[ClientMessage['method'], Record<string, unknown>, Record<string, unknown>]>)(
    'accepts well-typed %s params and rejects a mistyped field',
    (method, valid, invalid) => {
      expect(clientParamsValid(method, valid)).toBe(true);
      expect(clientParamsValid(method, invalid)).toBe(false);
    },
  );

  // Where the declared type *is* a literal union, checking the type means checking membership.
  it.each([
    ['moveTab', { dir: 1 }, { dir: 2 }],
    ['setDock', { index: 0, dock: 'left' }, { index: 0, dock: 'top' }],
    ['fileNavigatorSetDetail', { index: 0, details: 'size' }, { index: 0, details: 'owner' }],
    ['fileNavigatorOpen', { index: 0, relPath: 'a', command: 'edit' }, { index: 0, relPath: 'a', command: 'launch' }],
    ['pasteFileNavigatorItems', { index: 0, sources: [], destinationPath: '.', mode: 'cut' }, { index: 0, sources: [], destinationPath: '.', mode: 'move' }],
  ] as Array<[ClientMessage['method'], Record<string, unknown>, Record<string, unknown>]>)(
    'holds %s to the values its literal union declares',
    (method, valid, invalid) => {
      expect(clientParamsValid(method, valid)).toBe(true);
      expect(clientParamsValid(method, invalid)).toBe(false);
    },
  );

  it('treats an omitted optional field as present and a mistyped one as not', () => {
    expect(clientParamsValid('fileNavigatorReroot', { index: 0 })).toBe(true);
    expect(clientParamsValid('fileNavigatorReroot', { index: 0, path: '..' })).toBe(true);
    expect(clientParamsValid('fileNavigatorReroot', { index: 0, path: 3 })).toBe(false);
    expect(clientParamsValid('undoFileNavigatorItem', { index: 0, overwrite: 'yes' })).toBe(false);
  });
});
