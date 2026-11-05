import { describe, expect, it } from 'vitest';
import {
  CONNECTIONS_PAYLOAD_SCHEMA_VERSION, isConnectionsPayload, isEmptyIntent, isIdIntent, isKindIdOwnerIntent,
  recordConnectionName,
} from './shared.js';

const live = {
  type: 'live', id: 'sqlite:db', kind: 'sqlite', display: 'sqlite:db', host: 'Local', ownerLabel: 'owner', ownerName: 'Owner',
  status: 'Open', orderingTimestamp: 1,
};
const record = {
  type: 'record', id: 'uuid', kind: 'acp', title: 'Record', model: 'model', host: 'Local', ownerLabel: 'owner', ownerName: 'Owner',
  startedAt: 1, updatedAt: 2, status: 'Completed', orderingTimestamp: 2,
  window: {
    id: 'uuid', source: { kind: 'acp', model: 'model', ownerLabel: 'owner', ownerName: 'Owner' },
    blocks: [{ prompt: 'prompt', startedAt: 1, entries: [], answer: 'answer', endedAt: 2 }],
    totalBlocks: 1, offset: 0, hasOlder: false,
  },
};

describe('connections shared contract', () => {
  it('pins schema version and validates list and record payloads', () => {
    expect(CONNECTIONS_PAYLOAD_SCHEMA_VERSION).toBe(1);
    expect(isConnectionsPayload({ kind: 'list', rows: [live, record] })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record: live })).toBe(false);
  });

  it('accepts a live row marked permanent', () => {
    expect(isConnectionsPayload({ kind: 'list', rows: [{ ...live, permanent: true }] })).toBe(true);
  });

  it('names a record by its kind and owning tab name', () => {
    expect(recordConnectionName({ kind: 'acp', ownerName: 'build' })).toBe('acp:build');
    expect(recordConnectionName({ kind: 'agent', ownerName: 'release notes' })).toBe('agent:release notes');
  });

  it.each([
    null, [], { kind: 'unknown', rows: [] }, { kind: 'list', rows: [null] },
    { kind: 'list', rows: [{ ...live, status: 'Closed' }] },
    { kind: 'list', rows: [{ ...record, window: { ...record.window, blocks: null } }] },
    { kind: 'list', rows: [{ ...live, ownerLabel: undefined }] },
    { kind: 'list', rows: [{ ...live, host: undefined }] },
    { kind: 'list', rows: [{ ...live, permanent: false }] },
    { kind: 'list', rows: [{ ...live, permanent: 'yes' }] },
    { kind: 'list', rows: [{ ...record, host: 7 }] },
    { kind: 'connection', record: { ...record, model: undefined } },
  ])('rejects malformed payload %j', (value) => {
    expect(isConnectionsPayload(value)).toBe(false);
  });

  it('validates exact intent shapes', () => {
    expect(isEmptyIntent({})).toBe(true);
    expect(isEmptyIntent({ extra: true })).toBe(false);
    expect(isIdIntent({ id: 'uuid' })).toBe(true);
    expect(isIdIntent({ id: 'uuid', extra: true })).toBe(false);
    expect(isKindIdOwnerIntent({ kind: 'acp', id: 'uuid', ownerLabel: 'owner' })).toBe(true);
    expect(isKindIdOwnerIntent({ kind: 'acp', id: 'uuid' })).toBe(false);
    expect(isKindIdOwnerIntent({ kind: 'acp', id: 'uuid', ownerLabel: 'owner', extra: true })).toBe(false);
    expect(isKindIdOwnerIntent({ kind: 'agent', id: 'uuid', ownerLabel: 'owner' })).toBe(false);
  });
});
