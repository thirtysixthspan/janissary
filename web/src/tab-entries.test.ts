import { describe, it, expect } from 'vitest';
import { isReportingTab } from './tab-entries';

describe('isReportingTab', () => {
  it('returns true for monitor tabs', () => {
    expect(isReportingTab({ view: 'monitor' } as never)).toBe(true);
  });

  it('returns false for non-monitor tabs', () => {
    expect(isReportingTab({ view: 'agent' } as never)).toBe(false);
  });

  it('returns false for every other view kind the app renders', () => {
    for (const view of ['shell', 'editor', 'view']) {
      expect(isReportingTab({ view } as never)).toBe(false);
    }
  });
});
