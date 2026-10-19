import { describe, expect, it } from 'vitest';
import { isScriptsPayload } from '@shared/plugins/scripts/shared';
import ScriptsTabEntry, { isPayload } from './index';
import { ScriptsTab } from './ScriptsTab';

describe('scripts plugin entry', () => {
  it('default-exports the tab component', () => {
    expect(ScriptsTabEntry).toBe(ScriptsTab);
  });

  it('exports the shared payload guard as isPayload', () => {
    expect(isPayload).toBe(isScriptsPayload);
  });

  it('accepts a well-formed payload and rejects the malformed shapes', () => {
    expect(isPayload({ rows: [{ name: 'backup', schedules: 0, open: false }] })).toBe(true);
    expect(isPayload(null)).toBe(false);
    expect(isPayload([])).toBe(false);
    expect(isPayload({})).toBe(false);
    expect(isPayload({ rows: [{ name: 'backup', schedules: 0 }] })).toBe(false);
  });
});
