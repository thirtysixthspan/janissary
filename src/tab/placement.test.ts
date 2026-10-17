import { describe, expect, it } from 'vitest';
import {
  centerPane, closeQuitsApp, isCenterActionTab, isReportingTab, isSplitEligibleTab, type PlacedTab,
} from './placement.js';

const VIEWS = ['agent', 'plugin', 'harness', 'editor', 'monitor', 'files', 'notifications'] as const;

describe('centerPane', () => {
  it('places a tab with no pane on the left', () => {
    expect(centerPane({})).toBe('left');
  });

  it('places a right-pane tab on the right', () => {
    expect(centerPane({ pane: 'right' })).toBe('right');
  });
});

describe('isReportingTab', () => {
  it('is true for the monitor window only', () => {
    expect(VIEWS.filter((view) => isReportingTab({ view }))).toEqual(['monitor']);
  });

  it('is false for a shell tab with no view kind', () => {
    expect(isReportingTab({})).toBe(false);
  });
});

describe('isCenterActionTab', () => {
  it('admits every undocked view kind except the monitor window', () => {
    expect(VIEWS.filter((view) => isCenterActionTab({ view })))
      .toEqual(['agent', 'plugin', 'harness', 'editor', 'files', 'notifications']);
  });

  it('excludes a tab docked into either sidebar', () => {
    expect(isCenterActionTab({ dock: 'left' })).toBe(false);
    expect(isCenterActionTab({ dock: 'right', view: 'notifications' })).toBe(false);
  });
});

describe('isSplitEligibleTab', () => {
  it('admits center tabs other than the notifications tab', () => {
    expect(VIEWS.filter((view) => isSplitEligibleTab({ view })))
      .toEqual(['agent', 'plugin', 'harness', 'editor', 'files']);
  });

  it('excludes a docked tab', () => {
    expect(isSplitEligibleTab({ dock: 'left', view: 'agent' })).toBe(false);
  });
});

describe('closeQuitsApp', () => {
  const docked: PlacedTab = { dock: 'right', view: 'notifications' };

  it('quits when the last non-docked tab closes, whatever is docked', () => {
    expect(closeQuitsApp([docked, {}], 1)).toBe(true);
  });

  it('does not quit while another non-docked tab remains', () => {
    expect(closeQuitsApp([{}, { view: 'editor' }], 0)).toBe(false);
  });

  it('counts a visible non-docked reporting tab as an ordinary user close target', () => {
    expect(closeQuitsApp([{ view: 'monitor' }], 0)).toBe(true);
    expect(closeQuitsApp([{ view: 'monitor' }, { systemShell: true }], 0)).toBe(true);
  });

  it('never quits when the closing tab is docked', () => {
    expect(closeQuitsApp([docked, {}], 0)).toBe(false);
  });

  it('does not quit for an index that names no tab', () => {
    expect(closeQuitsApp([{}], 1)).toBe(false);
    expect(closeQuitsApp([{}], -1)).toBe(false);
  });

  it.each([{}, { hidden: true }, { dock: 'left' }, { hidden: true, dock: 'right' }] as const)('never counts a system record with placement %j', (placement) => {
    const system: PlacedTab = { ...placement, systemShell: true };
    expect(closeQuitsApp([system], 0)).toBe(false);
    expect(closeQuitsApp([system, {}], 1)).toBe(true);
    expect(closeQuitsApp([system, {}, { view: 'monitor' }], 1)).toBe(false);
  });

  it('excludes hidden records from navigation and splitting without changing reporting classification', () => {
    for (const view of VIEWS) {
      expect(isCenterActionTab({ view, hidden: true })).toBe(false);
      expect(isSplitEligibleTab({ view, hidden: true })).toBe(false);
    }
    expect(isReportingTab({ view: 'monitor', hidden: true })).toBe(true);
    expect(closeQuitsApp([{}, { hidden: true }], 0)).toBe(true);
  });
});
