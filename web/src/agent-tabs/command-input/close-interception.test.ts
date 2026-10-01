import { describe, expect, it } from 'vitest';
import type { TabView } from '@shared/protocol';
import { classifyTypedClose } from './close-interception';

const tab = (label: string, overrides: Partial<TabView> = {}) => ({ label, ...overrides }) as TabView;

describe('classifyTypedClose', () => {
  const tabs = [tab('janus'), tab('image', { view: 'plugin', title: 'alpha.png' }), tab('files', { dock: 'left' })];

  it('names the active tab for a bare close or exit', () => {
    expect(classifyTypedClose('close', tabs, 1)).toEqual({ kind: 'close', index: 1 });
    expect(classifyTypedClose('  EXIT  ', tabs, 0)).toEqual({ kind: 'close', index: 0 });
  });

  it('names the tab a close <name> matches by label or alias, ignoring case', () => {
    expect(classifyTypedClose('close alpha.png', tabs, 0)).toEqual({ kind: 'close', index: 1 });
    expect(classifyTypedClose('exit IMAGE', tabs, 0)).toEqual({ kind: 'close', index: 1 });
    expect(classifyTypedClose('close files', tabs, 0)).toEqual({ kind: 'close', index: 2 });
  });

  it('is no close for another command or an unknown name', () => {
    expect(classifyTypedClose('closet', tabs, 0)).toEqual({ kind: 'none' });
    expect(classifyTypedClose('echo close image', tabs, 0)).toEqual({ kind: 'none' });
    expect(classifyTypedClose('close nothing', tabs, 0)).toEqual({ kind: 'none' });
  });

  it('quits for a bare close on the last non-docked tab', () => {
    const lastCenter = [tab('janus', { dock: 'right' }), tab('image', { title: 'alpha.png' })];
    expect(classifyTypedClose('close', lastCenter, 1)).toEqual({ kind: 'quit' });
    expect(classifyTypedClose('exit', [tab('janus')], 0)).toEqual({ kind: 'quit' });
  });

  // The named spelling quits exactly when the bare one would, so it is confirmed exactly as often —
  // it used to reach the server unguarded and quit with no dialog at all.
  it('quits for a close <name> naming the last non-docked tab', () => {
    const lastCenter = [tab('janus', { dock: 'right' }), tab('image', { title: 'alpha.png' })];
    expect(classifyTypedClose('close alpha.png', lastCenter, 0)).toEqual({ kind: 'quit' });
    expect(classifyTypedClose('close janus', [tab('janus')], 0)).toEqual({ kind: 'quit' });
  });

  it('never quits for a docked tab, however few center tabs remain', () => {
    const lastCenter = [tab('janus'), tab('files', { dock: 'left' })];
    expect(classifyTypedClose('close files', lastCenter, 0)).toEqual({ kind: 'close', index: 1 });
  });
});
