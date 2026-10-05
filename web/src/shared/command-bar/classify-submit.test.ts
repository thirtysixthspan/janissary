import { afterEach, describe, expect, it } from 'vitest';
import type { TabView } from '@shared/protocol';
import { classifyCommandBarSubmit, navCommandQuery } from './classify-submit';
import { declareOverlayClaims } from '../contributed-overlays';

const tab = (label: string, overrides: Partial<TabView> = {}) => ({ label, ...overrides }) as TabView;

const claimed: (() => void)[] = [];
afterEach(() => { while (claimed.length > 0) claimed.pop()?.(); });

// A plugin claiming a command word, published through the same seam the classifier asks. `clip` is the
// first one the application ships; the name here is arbitrary because nothing else depends on it.
function claimCommand(command: string): void {
  claimed.push(declareOverlayClaims('fixture', { chords: [], command }));
}

describe('navCommandQuery', () => {
  it('reads nav, with or without a query, in any case and spacing', () => {
    expect(navCommandQuery('nav')).toBe('');
    expect(navCommandQuery('  NAV  ')).toBe('');
    expect(navCommandQuery('nav Shell 2 ')).toBe('Shell 2');
  });

  it('is nothing for a word that merely starts with nav', () => {
    expect(navCommandQuery('navigate')).toBeUndefined();
    expect(navCommandQuery('!nav')).toBeUndefined();
  });
});

describe('classifyCommandBarSubmit', () => {
  const tabs = [tab('janus'), tab('image', { view: 'plugin', title: 'alpha.png' }), tab('files', { dock: 'left' })];

  it('confirms a quit, whatever case and surrounding space it was typed in', () => {
    expect(classifyCommandBarSubmit('quit', tabs, 0)).toEqual({ kind: 'confirm-quit' });
    expect(classifyCommandBarSubmit('  QUIT  ', tabs, 0)).toEqual({ kind: 'confirm-quit' });
  });

  it('normalizes one leading slash before classifying quit and close commands', () => {
    expect(classifyCommandBarSubmit('/quit', tabs, 0)).toEqual({ kind: 'confirm-quit' });
    expect(classifyCommandBarSubmit('/close', tabs, 1)).toEqual({ kind: 'confirm-close', index: 1 });
    expect(classifyCommandBarSubmit('/exit', tabs, 0)).toEqual({ kind: 'confirm-close', index: 0 });
    expect(classifyCommandBarSubmit('/close alpha.png', tabs, 0))
      .toEqual({ kind: 'confirm-close', index: 1 });
  });

  it('is not a quit for a word that merely contains one', () => {
    expect(classifyCommandBarSubmit('quitter', tabs, 0)).toEqual({ kind: 'run' });
    expect(classifyCommandBarSubmit('echo quit', tabs, 0)).toEqual({ kind: 'run' });
  });

  it('runs an ordinary command word', () => {
    expect(classifyCommandBarSubmit('ls -la', tabs, 0)).toEqual({ kind: 'run' });
    expect(classifyCommandBarSubmit('agent bekir', tabs, 0)).toEqual({ kind: 'run' });
  });

  it('opens an overlay for a bare word in the shared table', () => {
    expect(classifyCommandBarSubmit('theme', tabs, 0)).toEqual({ kind: 'overlay', command: 'theme' });
    expect(classifyCommandBarSubmit('HIST', tabs, 0)).toEqual({ kind: 'overlay', command: 'hist' });
    expect(classifyCommandBarSubmit('profile launch', tabs, 0))
      .toEqual({ kind: 'overlay', command: 'profile launch' });
  });

  it('runs a table word carrying an argument, because the bare word is what opens the overlay', () => {
    expect(classifyCommandBarSubmit('theme dark', tabs, 0)).toEqual({ kind: 'run' });
    expect(classifyCommandBarSubmit('profile launch demo', tabs, 0)).toEqual({ kind: 'run' });
  });

  it('opens an overlay for a command word a plugin claims', () => {
    claimCommand('clip');
    expect(classifyCommandBarSubmit('clip', tabs, 0)).toEqual({ kind: 'overlay', command: 'clip' });
  });

  // `in` walks the prototype chain, so an object table would answer true for `toString` and the caller
  // would index a picker that is not there.
  it('opens no overlay for a word that only shares a name with the table\'s prototype', () => {
    expect(classifyCommandBarSubmit('constructor', tabs, 0)).toEqual({ kind: 'run' });
    expect(classifyCommandBarSubmit('toString', tabs, 0)).toEqual({ kind: 'run' });
  });

  it('names the active tab for a bare close or exit', () => {
    expect(classifyCommandBarSubmit('close', tabs, 1)).toEqual({ kind: 'confirm-close', index: 1 });
    expect(classifyCommandBarSubmit('  EXIT  ', tabs, 0)).toEqual({ kind: 'confirm-close', index: 0 });
  });

  it('names the tab a close <name> matches by label or alias, ignoring case', () => {
    expect(classifyCommandBarSubmit('close alpha.png', tabs, 0)).toEqual({ kind: 'confirm-close', index: 1 });
    expect(classifyCommandBarSubmit('exit IMAGE', tabs, 0)).toEqual({ kind: 'confirm-close', index: 1 });
    expect(classifyCommandBarSubmit('close files', tabs, 0)).toEqual({ kind: 'confirm-close', index: 2 });
  });

  it('runs another command, and runs a close naming a tab that is not open', () => {
    expect(classifyCommandBarSubmit('closet', tabs, 0)).toEqual({ kind: 'run' });
    expect(classifyCommandBarSubmit('echo close image', tabs, 0)).toEqual({ kind: 'run' });
    expect(classifyCommandBarSubmit('close nothing', tabs, 0)).toEqual({ kind: 'run' });
  });

  it('quits for a bare close on the last non-docked tab', () => {
    const lastCenter = [tab('janus', { dock: 'right' }), tab('image', { title: 'alpha.png' })];
    expect(classifyCommandBarSubmit('close', lastCenter, 1)).toEqual({ kind: 'confirm-quit' });
    expect(classifyCommandBarSubmit('exit', [tab('janus')], 0)).toEqual({ kind: 'confirm-quit' });
    expect(classifyCommandBarSubmit('/close', lastCenter, 1)).toEqual({ kind: 'confirm-quit' });
    expect(classifyCommandBarSubmit('/exit', [tab('janus')], 0)).toEqual({ kind: 'confirm-quit' });
  });

  // The named spelling quits exactly when the bare one would, so it is confirmed exactly as often —
  // it used to reach the server unguarded and quit with no dialog at all.
  it('quits for a close <name> naming the last non-docked tab', () => {
    const lastCenter = [tab('janus', { dock: 'right' }), tab('image', { title: 'alpha.png' })];
    expect(classifyCommandBarSubmit('close alpha.png', lastCenter, 0)).toEqual({ kind: 'confirm-quit' });
    expect(classifyCommandBarSubmit('close janus', [tab('janus')], 0)).toEqual({ kind: 'confirm-quit' });
    expect(classifyCommandBarSubmit('/close alpha.png', lastCenter, 0)).toEqual({ kind: 'confirm-quit' });
  });

  it('never quits for a docked tab, however few center tabs remain', () => {
    const lastCenter = [tab('janus'), tab('files', { dock: 'left' })];
    expect(classifyCommandBarSubmit('close files', lastCenter, 0)).toEqual({ kind: 'confirm-close', index: 1 });
  });

  it('treats nav as an ordinary line, because the navigator is the agent bar\'s own branch', () => {
    expect(classifyCommandBarSubmit('nav', tabs, 0)).toEqual({ kind: 'run' });
    expect(classifyCommandBarSubmit('nav janus', tabs, 0)).toEqual({ kind: 'run' });
  });
});
