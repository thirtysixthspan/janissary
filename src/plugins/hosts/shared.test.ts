import { describe, expect, it } from 'vitest';
import {
  HOSTS_PAYLOAD_SCHEMA_VERSION,
  isHostsPayload,
  isOpenIntent,
  isRefreshIntent,
  type HostRow,
  type HostsPayload,
} from './shared.js';

const ROW: HostRow = {
  name: 'lab', user: 'admin', destination: 'devbox:2222', path: '/srv/ws',
};

const PAYLOAD: HostsPayload = { filePath: '/home/me/.janissary/hosts.json', rows: [ROW] };

describe('hosts shared contract', () => {
  it('pins its payload schema version to 1', () => {
    expect(HOSTS_PAYLOAD_SCHEMA_VERSION).toBe(1);
  });

  it('accepts an empty payload and a complete one', () => {
    expect(isHostsPayload({ filePath: '/hosts.json', rows: [] })).toBe(true);
    expect(isHostsPayload(PAYLOAD)).toBe(true);
  });

  it('preserves the row order the server supplied', () => {
    const second: HostRow = { name: 'zeta', user: '', destination: 'other', path: '' };
    const value: HostsPayload = { ...PAYLOAD, rows: [second, ROW] };
    expect(isHostsPayload(value)).toBe(true);
    expect(value.rows.map((row) => row.name)).toEqual(['zeta', 'lab']);
  });

  it('accepts an absent user and path as empty strings', () => {
    expect(isHostsPayload({
      filePath: '/hosts.json',
      rows: [{ name: 'lab', user: '', destination: 'devbox', path: '' }],
    })).toBe(true);
  });

  it('rejects null, an array, and a payload missing its file or rows', () => {
    expect(isHostsPayload(null)).toBe(false);
    expect(isHostsPayload([ROW])).toBe(false);
    expect(isHostsPayload({ rows: [ROW] })).toBe(false);
    expect(isHostsPayload({ filePath: '/hosts.json' })).toBe(false);
  });

  it('rejects a non-string file path and a non-array rows value', () => {
    expect(isHostsPayload({ filePath: 7, rows: [ROW] })).toBe(false);
    expect(isHostsPayload({ filePath: '/hosts.json', rows: {} })).toBe(false);
  });

  it('rejects a row missing any required field', () => {
    for (const field of Object.keys(ROW)) {
      const partial: Record<string, unknown> = { ...ROW };
      delete partial[field];
      expect(isHostsPayload({ filePath: '/hosts.json', rows: [partial] })).toBe(false);
    }
  });

  it('rejects a row whose name or destination is empty', () => {
    expect(isHostsPayload({ filePath: '/hosts.json', rows: [{ ...ROW, name: '' }] })).toBe(false);
    expect(isHostsPayload({ filePath: '/hosts.json', rows: [{ ...ROW, destination: '' }] })).toBe(false);
  });

  it('rejects a row field of the wrong type rather than ignoring it', () => {
    expect(isHostsPayload({ filePath: '/hosts.json', rows: [{ ...ROW, user: 7 }] })).toBe(false);
    expect(isHostsPayload({ filePath: '/hosts.json', rows: [{ ...ROW, path: null }] })).toBe(false);
    expect(isHostsPayload({ filePath: '/hosts.json', rows: ['lab'] })).toBe(false);
  });
});

describe('hosts intent guards', () => {
  it('accepts an empty refresh object and nothing else', () => {
    expect(isRefreshIntent({})).toBe(true);
    expect(isRefreshIntent({ name: 'lab' })).toBe(false);
    expect(isRefreshIntent(null)).toBe(false);
    expect(isRefreshIntent([])).toBe(false);
  });

  it('accepts an open target with a nonempty name', () => {
    expect(isOpenIntent({ name: 'lab' })).toBe(true);
    expect(isOpenIntent({ name: 'lab', extra: 1 })).toBe(true);
  });

  it('rejects an open target with no name, an empty name, or the wrong shape', () => {
    expect(isOpenIntent({ name: '' })).toBe(false);
    expect(isOpenIntent({})).toBe(false);
    expect(isOpenIntent({ name: 7 })).toBe(false);
    expect(isOpenIntent(null)).toBe(false);
    expect(isOpenIntent(['lab'])).toBe(false);
  });
});
