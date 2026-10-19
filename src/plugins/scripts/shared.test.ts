import { describe, expect, it } from 'vitest';
import { buildRunscriptRows } from '../../schedule/system/runscript-rows.js';
import {
  isCreateIntent,
  isNameIntent,
  isScriptsPayload,
  type RunscriptRow,
  type ScriptsPayload,
} from './shared.js';

const ROW: RunscriptRow = { name: 'deploy', schedules: 1, open: true };
const PAYLOAD: ScriptsPayload = { rows: [ROW] };

describe('scripts shared contract', () => {
  it('accepts the rows the host builds', () => {
    expect(isScriptsPayload({ rows: buildRunscriptRows(['deploy'], () => 1, () => true) })).toBe(true);
  });

  it('accepts a complete payload', () => {
    expect(isScriptsPayload({ rows: [] })).toBe(true);
    expect(isScriptsPayload(PAYLOAD)).toBe(true);
  });

  it('rejects null, an array, a missing rows list, and a malformed row', () => {
    expect(isScriptsPayload(null)).toBe(false);
    expect(isScriptsPayload([PAYLOAD])).toBe(false);
    expect(isScriptsPayload({})).toBe(false);
    expect(isScriptsPayload({ rows: {} })).toBe(false);
    for (const field of Object.keys(ROW)) {
      const partial: Record<string, unknown> = { ...ROW };
      delete partial[field];
      expect(isScriptsPayload({ rows: [partial] })).toBe(false);
    }
    expect(isScriptsPayload({ rows: [{ ...ROW, name: 1 }] })).toBe(false);
    expect(isScriptsPayload({ rows: [{ ...ROW, schedules: '1' }] })).toBe(false);
    expect(isScriptsPayload({ rows: [{ ...ROW, open: 'yes' }] })).toBe(false);
  });

  it('accepts a name intent only when its payload is an object with a string name', () => {
    expect(isNameIntent({ name: 'deploy' })).toBe(true);
    expect(isNameIntent({})).toBe(false);
    expect(isNameIntent({ name: 1 })).toBe(false);
    expect(isNameIntent(['deploy'])).toBe(false);
    expect(isNameIntent(null)).toBe(false);
  });

  it('accepts a create intent with any object, and rejects arrays and null', () => {
    expect(isCreateIntent({})).toBe(true);
    expect(isCreateIntent({ name: 'deploy' })).toBe(true);
    expect(isCreateIntent([])).toBe(false);
    expect(isCreateIntent(null)).toBe(false);
  });
});
