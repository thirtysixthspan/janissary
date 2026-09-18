import { describe, expect, it } from 'vitest';
import type { RemoteSessionView } from '../../protocol.js';
import { sessionsManifest } from './manifest.js';
import {
  SESSIONS_PAYLOAD_SCHEMA_VERSION,
  isSessionIntent,
  isSessionsPayload,
  type SessionRow,
} from './shared.js';

const ROW: SessionRow = {
  id: 'claude', host: 'devbox', name: 'claude', kind: 'harness', state: 'active',
  activity: 1000, destination: 'devbox', workspace: '/srv/ws', joined: false,
  actions: ['focus', 'detach'], label: 'claude',
};

// The shared contract has to stay import-free, so its row shape is re-declared rather than imported
// from the wire type the topic actually delivers. These two assignments are the pin that keeps the
// copy honest: either shape gaining or losing a field fails to compile here.
const asWireRow: RemoteSessionView = ROW;
const asPluginRow: SessionRow = asWireRow;

describe('sessions shared contract', () => {
  it('re-declares the remote session row exactly', () => {
    expect(asPluginRow).toEqual(ROW);
  });

  it('accepts an empty payload and a complete one', () => {
    expect(isSessionsPayload({ entries: [] })).toBe(true);
    expect(isSessionsPayload({ entries: [ROW] })).toBe(true);
  });

  it('accepts the optional session id and failure text', () => {
    expect(isSessionsPayload({
      entries: [{ ...ROW, session: 'abc', failure: 'devbox: timed out' }],
    })).toBe(true);
  });

  it('rejects null, an array, a missing entries list, and a non-array entries value', () => {
    expect(isSessionsPayload(null)).toBe(false);
    expect(isSessionsPayload([ROW])).toBe(false);
    expect(isSessionsPayload({})).toBe(false);
    expect(isSessionsPayload({ entries: {} })).toBe(false);
  });

  it('rejects a row missing any required field', () => {
    for (const field of Object.keys(ROW)) {
      const partial: Record<string, unknown> = { ...ROW };
      delete partial[field];
      expect(isSessionsPayload({ entries: [partial] })).toBe(false);
    }
  });

  it('rejects a kind, state, or action outside the declared values', () => {
    expect(isSessionsPayload({ entries: [{ ...ROW, kind: 'browser' }] })).toBe(false);
    expect(isSessionsPayload({ entries: [{ ...ROW, state: 'sleeping' }] })).toBe(false);
    expect(isSessionsPayload({ entries: [{ ...ROW, actions: ['explode'] }] })).toBe(false);
  });

  it('rejects an optional field of the wrong type rather than ignoring it', () => {
    expect(isSessionsPayload({ entries: [{ ...ROW, session: 7 }] })).toBe(false);
    expect(isSessionsPayload({ entries: [{ ...ROW, failure: {} }] })).toBe(false);
  });

  it('accepts a row intent naming a row and rejects an empty or absent id', () => {
    expect(isSessionIntent({ id: 'claude' })).toBe(true);
    expect(isSessionIntent({ id: '' })).toBe(false);
    expect(isSessionIntent({})).toBe(false);
    expect(isSessionIntent(null)).toBe(false);
    expect(isSessionIntent(['claude'])).toBe(false);
  });
});

describe('sessions manifest', () => {
  it('pins its payload schema version to the contract\'s own constant', () => {
    expect(sessionsManifest.payloadSchemaVersion).toBe(SESSIONS_PAYLOAD_SCHEMA_VERSION);
  });

  it('claims the sessions command, the sessions topic, and no file extensions', () => {
    expect(sessionsManifest.command).toBe('sessions');
    expect(sessionsManifest.notifications).toEqual(['sessions']);
    expect(sessionsManifest.fileExtensions).toEqual({});
  });

  // A declaration naming a topic must supply `notify`, and asking for a capability it does not
  // declare disables the plugin — so the declared set is exactly what `activate` uses.
  it('declares every capability its activation uses and nothing more', () => {
    expect([...sessionsManifest.capabilities].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'dockTab', 'openOrFocusTab', 'rejectRequest', 'reportFailure', 'topicAction', 'topicData',
      'updateTab',
    ]);
  });
});
