import { describe, expect, it } from 'vitest';
import type { TabView } from '@shared/protocol';
import { typedCloseIndex } from './close-interception';

const tab = (label: string, overrides: Partial<TabView> = {}) => ({ label, ...overrides }) as TabView;

describe('typedCloseIndex', () => {
  const tabs = [tab('janus'), tab('image', { view: 'plugin', title: 'alpha.png' }), tab('files', { dock: 'left' })];

  it('names the active tab for a bare close or exit', () => {
    expect(typedCloseIndex('close', tabs, 1)).toBe(1);
    expect(typedCloseIndex('  EXIT  ', tabs, 0)).toBe(0);
  });

  it('names the tab a close <name> matches by label or alias, ignoring case', () => {
    expect(typedCloseIndex('close alpha.png', tabs, 0)).toBe(1);
    expect(typedCloseIndex('exit IMAGE', tabs, 0)).toBe(1);
    expect(typedCloseIndex('close files', tabs, 0)).toBe(2);
  });

  it('names no tab for another command or an unknown name', () => {
    expect(typedCloseIndex('closet', tabs, 0)).toBe(-1);
    expect(typedCloseIndex('echo close image', tabs, 0)).toBe(-1);
    expect(typedCloseIndex('close nothing', tabs, 0)).toBe(-1);
  });

  it('names no tab when closing the named one would quit the app', () => {
    const lastCenter = [tab('janus', { dock: 'right' }), tab('image', { title: 'alpha.png' })];
    expect(typedCloseIndex('close alpha.png', lastCenter, 0)).toBe(-1);
  });
});
