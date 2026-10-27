import { describe, expect, it } from 'vitest';
import { getClientLayout, patchClientLayout, setClientLayout } from './client-layout.js';

describe('client-layout', () => {
  it('returns undefined before any layout has been reported', () => {
    expect(getClientLayout()).toBeUndefined();
  });

  it('does not hold a layout event when no client has reported yet', () => {
    patchClientLayout({ sidebarLeft: 400 });

    expect(getClientLayout()).toBeUndefined();
  });

  it('returns the most recently reported layout, last report wins', () => {
    setClientLayout({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70, splitPct: 50 });
    setClientLayout({ sidebarLeft: 340, sidebarRight: 260, tabAreaPct: 65, splitPct: 60 });

    expect(getClientLayout()).toEqual({ sidebarLeft: 340, sidebarRight: 260, tabAreaPct: 65, splitPct: 60 });
  });

  it('merges only the sizes carried by a layout event into the held report', () => {
    setClientLayout({ sidebarLeft: 340, sidebarRight: 260, tabAreaPct: 65, splitPct: 50 });

    patchClientLayout({ sidebarLeft: 400, splitPct: 62 });

    expect(getClientLayout()).toEqual({ sidebarLeft: 400, sidebarRight: 260, tabAreaPct: 65, splitPct: 62 });
  });

});
