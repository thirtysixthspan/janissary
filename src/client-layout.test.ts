import { describe, expect, it } from 'vitest';
import { getClientLayout, setClientLayout } from './client-layout.js';

describe('client-layout', () => {
  it('returns undefined before any layout has been reported', () => {
    expect(getClientLayout()).toBeUndefined();
  });

  it('returns the most recently reported layout, last report wins', () => {
    setClientLayout({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });
    setClientLayout({ sidebarLeft: 340, sidebarRight: 260, tabAreaPct: 65 });

    expect(getClientLayout()).toEqual({ sidebarLeft: 340, sidebarRight: 260, tabAreaPct: 65 });
  });
});
