import { describe, expect, it } from 'vitest';
import {
  CONNECTIONS_PAYLOAD_SCHEMA_VERSION, isConnectionsPayload, isEmptyIntent, isIdIntent, isKindIdOwnerIntent,
} from './shared.js';

const live = {
  type: 'live', id: 'sqlite:db', kind: 'sqlite', display: 'sqlite:db', ownerLabel: 'owner', ownerName: 'Owner',
  status: 'Open', orderingTimestamp: 1,
};
const record = {
  type: 'record', id: 'uuid', kind: 'acp', title: 'Record', model: 'model', ownerLabel: 'owner', ownerName: 'Owner',
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

  it.each([
    null, [], { kind: 'unknown', rows: [] }, { kind: 'list', rows: [null] },
    { kind: 'list', rows: [{ ...live, status: 'Closed' }] },
    { kind: 'list', rows: [{ ...record, window: { ...record.window, blocks: null } }] },
    { kind: 'list', rows: [{ ...live, ownerLabel: undefined }] },
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
