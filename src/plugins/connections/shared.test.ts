import { describe, expect, it } from 'vitest';
import { isEmptyIntent, isIdIntent } from '../api.js';
import { connectionsManifest } from './manifest.js';
import {
  CONNECTIONS_PAYLOAD_SCHEMA_VERSION, isConnectionsPayload, isKindIdOwnerIntent,
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
const subagent = {
  ...record, id: 'sub-uuid', kind: 'agent', title: 'Subagent: task.md', runId: 'run-1', subagentRole: 'research',
  window: {
    ...record.window, id: 'sub-uuid',
    source: { kind: 'agent', model: 'model', ownerLabel: 'owner', ownerName: 'Owner', runId: 'run-1', taskPath: 'task.md', subagentRole: 'research' },
  },
};

describe('connections shared contract', () => {
  it('pins schema version and validates list and record payloads', () => {
    expect(CONNECTIONS_PAYLOAD_SCHEMA_VERSION).toBe(2);
    expect(connectionsManifest.payloadSchemaVersion).toBe(CONNECTIONS_PAYLOAD_SCHEMA_VERSION);
    expect(isConnectionsPayload({ kind: 'list', rows: [live, record] })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record: live })).toBe(false);
  });

  it('accepts an optional string preamble on a record block and rejects a non-string one', () => {
    const withPreamble = {
      ...record, window: {
        ...record.window,
        blocks: [{ ...record.window.blocks[0], preamble: 'tool primer' }],
      },
    };
    const badPreamble = {
      ...record, window: {
        ...record.window,
        blocks: [{ ...record.window.blocks[0], preamble: 3 }],
      },
    };
    expect(isConnectionsPayload({ kind: 'connection', record: withPreamble })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record: badPreamble })).toBe(false);
  });

  it('accepts an array of reply strings on a record block and rejects malformed replies', () => {
    const withReplies = {
      ...record, window: {
        ...record.window,
        blocks: [{ ...record.window.blocks[0], replies: ['first', 'answer'] }],
      },
    };
    const badReplies = {
      ...record, window: {
        ...record.window,
        blocks: [{ ...record.window.blocks[0], replies: ['first', 3] }],
      },
    };
    expect(isConnectionsPayload({ kind: 'connection', record: withReplies })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record: badReplies })).toBe(false);
  });

  it('requires a role on live ACP refs while accepting legacy retained records', () => {
    const oldLiveRef = { ...live, acpRef: { scope: 'tab', label: 'Owner' } };

    expect(isConnectionsPayload({ kind: 'list', rows: [oldLiveRef] })).toBe(false);
    expect(isConnectionsPayload({ kind: 'list', rows: [record] })).toBe(true);
  });

  it('accepts ask and tell roles while preserving legacy role-less rows and sources', () => {
    const ask = {
      ...record, role: 'ask',
      window: { ...record.window, source: { ...record.window.source, role: 'ask' } },
    };
    const tell = {
      ...record, role: 'tell',
      window: { ...record.window, source: { ...record.window.source, role: 'tell' } },
    };

    expect(isConnectionsPayload({ kind: 'list', rows: [record, ask, tell] })).toBe(true);
    expect(recordConnectionName({ kind: 'acp', ownerName: 'build', role: 'ask' })).toBe('acp:ask:build');
    expect(recordConnectionName({ kind: 'acp', ownerName: 'build', role: 'tell' })).toBe('acp:tell:build');
    expect(recordConnectionName({ kind: 'acp', ownerName: 'build' })).toBe('acp:build');
    expect(recordConnectionName({ kind: 'agent', ownerName: 'release notes' })).toBe('agent:release notes');
  });

  it('accepts a declared persona role on an ACP record row and window source and names it', () => {
    const declared = {
      ...record, role: 'ask', declaredRole: 'research',
      window: { ...record.window, source: { ...record.window.source, role: 'ask', declaredRole: 'research' } },
    };

    expect(isConnectionsPayload({ kind: 'list', rows: [declared] })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record: declared })).toBe(true);
    expect(recordConnectionName({ kind: 'acp', ownerName: 'build', role: 'ask', declaredRole: 'research' })).toBe('acp:research:build');
    expect(recordConnectionName({ kind: 'acp', ownerName: 'build', role: 'ask' })).toBe('acp:ask:build');
    expect(recordConnectionName({ kind: 'acp', ownerName: 'build' })).toBe('acp:build');
  });

  it('accepts a live row marked permanent', () => {
    expect(isConnectionsPayload({ kind: 'list', rows: [{ ...live, permanent: true }] })).toBe(true);
  });

  it('names a record by its kind and owning tab name', () => {
    expect(recordConnectionName({ kind: 'acp', ownerName: 'build' })).toBe('acp:build');
    expect(recordConnectionName({ kind: 'agent', ownerName: 'release notes' })).toBe('agent:release notes');
  });

  it('names a subagent record by its canonical role, leaving other names unchanged', () => {
    expect(recordConnectionName({ kind: 'agent', ownerName: 'caller', subagentRole: 'research' })).toBe('subagent:research');
    expect(recordConnectionName({ kind: 'agent', ownerName: 'caller' })).toBe('agent:caller');
    expect(recordConnectionName({ kind: 'acp', ownerName: 'caller', role: 'ask' })).toBe('acp:ask:caller');
  });

  it('accepts valid subagent metadata on an agent row and window source', () => {
    expect(isConnectionsPayload({ kind: 'list', rows: [subagent] })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record: subagent })).toBe(true);
  });

  it('accepts a Partial terminal agent row while rejecting Partial on a live row', () => {
    const partial = { ...subagent, status: 'Partial' };
    expect(isConnectionsPayload({ kind: 'list', rows: [partial] })).toBe(true);
    expect(isConnectionsPayload({ kind: 'connection', record: partial })).toBe(true);
    expect(isConnectionsPayload({ kind: 'list', rows: [{ ...live, status: 'Partial' }] })).toBe(false);
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
    { kind: 'list', rows: [{ ...record, role: 'review' }] },
    { kind: 'list', rows: [{ ...record, kind: 'agent', runId: 'run-1', role: 'ask' }] },
    { kind: 'list', rows: [{ ...record, window: { ...record.window, source: { ...record.window.source, role: 'review' } } }] },
    { kind: 'list', rows: [{ ...record, window: { ...record.window, source: { kind: 'agent', model: 'model', ownerLabel: 'owner', ownerName: 'Owner', runId: 'run-1', taskPath: 'task.md', role: 'tell' } } }] },
    { kind: 'list', rows: [{ ...subagent, subagentRole: '' }] },
    { kind: 'list', rows: [{ ...subagent, subagentRole: ' '.repeat(3) }] },
    { kind: 'list', rows: [{ ...subagent, subagentRole: 7 }] },
    { kind: 'list', rows: [{ ...subagent, window: { ...subagent.window, source: { ...subagent.window.source, subagentRole: '' } } }] },
    { kind: 'list', rows: [{ ...record, subagentRole: 'research' }] },
    { kind: 'list', rows: [{ ...record, window: { ...record.window, source: { ...record.window.source, subagentRole: 'research' } } }] },
    { kind: 'list', rows: [{ ...record, declaredRole: '' }] },
    { kind: 'list', rows: [{ ...record, declaredRole: ' '.repeat(3) }] },
    { kind: 'list', rows: [{ ...record, declaredRole: 7 }] },
    { kind: 'list', rows: [{ ...record, window: { ...record.window, source: { ...record.window.source, declaredRole: '' } } }] },
    { kind: 'list', rows: [{ ...subagent, declaredRole: 'research' }] },
    { kind: 'list', rows: [{ ...live, declaredRole: 'research' }] },
    { kind: 'list', rows: [{ ...live, role: 'tell' }] },
    { kind: 'connection', record: { ...record, model: undefined } },
  ])('rejects malformed payload %j', (value) => {
    expect(isConnectionsPayload(value)).toBe(false);
  });

  it('accepts connection windows whose tool entries carry a phase and correlation', () => {
    const withPhase = {
      ...record,
      window: {
        ...record.window,
        blocks: [{
          ...record.window.blocks[0],
          entries: [
            { kind: 'tool', text: 'file list .', timestamp: 1, toolPhase: 'command' },
            { kind: 'tool', text: 'a.md', timestamp: 2, toolPhase: 'reply', toolCommand: 'file list .' },
          ],
        }],
      },
    };
    expect(isConnectionsPayload({ kind: 'connection', record: withPhase })).toBe(true);
  });

  it.each(['start', 3, null])('rejects a connection window with invalid tool phase %j', (toolPhase) => {
    const withPhase = {
      ...record,
      window: {
        ...record.window,
        blocks: [{
          ...record.window.blocks[0],
          entries: [{ kind: 'tool', text: 'x', timestamp: 1, toolPhase }],
        }],
      },
    };
    expect(isConnectionsPayload({ kind: 'connection', record: withPhase })).toBe(false);
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
