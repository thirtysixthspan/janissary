import { describe, expect, it } from 'vitest';
import { composeSessionRows, type SessionChannel, type SessionsSnapshot } from './rows.js';
import type { RemoteSessionRecord } from './store.js';

function snapshot(overrides: Partial<SessionsSnapshot> = {}): SessionsSnapshot {
  return { channels: [], ssh: [], detached: [], ended: [], ...overrides };
}

function channel(overrides: Partial<SessionChannel> = {}): SessionChannel {
  return {
    launchLabel: 'claude',
    host: 'devbox',
    destination: 'devbox',
    workspace: '/srv/proj/.janissary/workspace/claude',
    session: '11111111-2222-3333-4444-555555555555',
    provisioning: false,
    reconnecting: false,
    members: [{ label: 'claude', name: 'claude', kind: 'harness', activity: 100 }],
    ...overrides,
  };
}

function record(overrides: Partial<RemoteSessionRecord> = {}): RemoteSessionRecord {
  return {
    session: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    address: 'devbox',
    destination: 'devbox',
    host: 'devbox',
    workspaceLabel: 'claude-2',
    workspaceDir: '/srv/proj/.janissary/workspace/claude-2',
    launchLabel: 'claude-2',
    launchKind: 'harness',
    processes: [{ id: 'spawn-1', label: 'claude-2', kind: 'harness' }],
    activity: 50,
    ...overrides,
  };
}

describe('composeSessionRows live channels', () => {
  it('reads a channel with a landed workspace as active', () => {
    const [row] = composeSessionRows(snapshot({ channels: [channel()] }));
    expect(row.state).toBe('active');
    expect(row.kind).toBe('harness');
    expect(row.host).toBe('devbox');
    expect(row.name).toBe('claude');
  });

  it('reads a channel whose clone has not landed as provisioning', () => {
    const [row] = composeSessionRows(snapshot({ channels: [channel({ provisioning: true })] }));
    expect(row.state).toBe('provisioning');
  });

  // Separating this from active is what explains an unresponsive remote tab: the tabs are open, the
  // transport is gone, and janissary is already retrying.
  it('reads a channel mid-backoff as reconnecting', () => {
    const [row] = composeSessionRows(snapshot({ channels: [channel({ reconnecting: true })] }));
    expect(row.state).toBe('reconnecting');
  });

  // Decision 10: on a row that is already retrying, reattach means "try now" — the same verb as a
  // parked session's, because it is the same request, and the state is what says which wait it ends.
  it('offers reattach on a reconnecting row, beside the detach it still has', () => {
    const [row] = composeSessionRows(snapshot({ channels: [channel({ reconnecting: true })] }));
    expect(row.actions).toEqual(['focus', 'reattach', 'detach']);
  });

  it('offers no reattach on a row whose transport is healthy', () => {
    const [row] = composeSessionRows(snapshot({ channels: [channel()] }));
    expect(row.actions).not.toContain('reattach');
  });

  it('leaves a joined row of a reconnecting channel with focus and close alone', () => {
    const rows = composeSessionRows(snapshot({
      channels: [channel({
        reconnecting: true,
        members: [
          { label: 'claude', name: 'claude', kind: 'harness', activity: 100 },
          { label: 'bekir', name: 'bekir', kind: 'agent', activity: 90 },
        ],
      })],
    }));
    expect(rows[1].actions).toEqual(['focus', 'close']);
  });

  it('carries the full destination and workspace path for the tooltip', () => {
    const [row] = composeSessionRows(snapshot({
      channels: [channel({ destination: 'admin@devbox', workspace: '/srv/ws' })],
    }));
    expect(row.destination).toBe('admin@devbox');
    expect(row.workspace).toBe('/srv/ws');
  });

  it('offers focus and detach on the launching row', () => {
    const [row] = composeSessionRows(snapshot({ channels: [channel()] }));
    expect(row.actions).toEqual(['focus', 'detach']);
    expect(row.joined).toBe(false);
  });

  // The control stays where the eye expects it while the clone lands; the row's state is what says
  // it cannot be pressed yet.
  it('keeps detach on a provisioning row rather than making the control appear later', () => {
    const [row] = composeSessionRows(snapshot({ channels: [channel({ provisioning: true })] }));
    expect(row.actions).toContain('detach');
  });

  it('offers focus and close on a joined row, never detach', () => {
    const rows = composeSessionRows(snapshot({
      channels: [channel({
        members: [
          { label: 'claude', name: 'claude', kind: 'harness', activity: 100 },
          { label: 'bekir', name: 'bekir', kind: 'agent', activity: 90 },
        ],
      })],
    }));
    expect(rows[1].actions).toEqual(['focus', 'close']);
    expect(rows[1].joined).toBe(true);
  });

  it('marks a navigator riding the channel as joined and closable', () => {
    const rows = composeSessionRows(snapshot({
      channels: [channel({
        members: [
          { label: 'claude', name: 'claude', kind: 'harness', activity: 100 },
          { label: 'files', name: '$workspace/claude', kind: 'navigator', activity: 80 },
        ],
      })],
    }));
    expect(rows[1].kind).toBe('navigator');
    expect(rows[1].actions).toEqual(['focus', 'close']);
  });
});

// The channel survives its launching tab's closure while joined tabs keep it alive; the destroy-only
// path this replaces closed the last tab and took the park option with it.
describe('composeSessionRows channels without their launching member', () => {
  function launchAbsent(overrides: Partial<SessionChannel> = {}): SessionChannel {
    return channel({
      members: [{ label: 'bekir', name: 'bekir', kind: 'agent', activity: 90 }],
      ...overrides,
    });
  }

  it('offers the park path on a surviving row of a launch-member-less channel', () => {
    const [row] = composeSessionRows(snapshot({ channels: [launchAbsent()] }));
    expect(row.actions).toEqual(['focus', 'detach']);
    expect(row.joined).toBe(true);
  });

  it('offers try-now detach on a surviving row while the channel is reconnecting', () => {
    const [row] = composeSessionRows(snapshot({ channels: [launchAbsent({ reconnecting: true })] }));
    expect(row.actions).toEqual(['focus', 'reattach', 'detach']);
  });

  it('keeps a channel with its launching member present at per-member actions', () => {
    const rows = composeSessionRows(snapshot({
      channels: [channel({
        members: [
          { label: 'claude', name: 'claude', kind: 'harness', activity: 100 },
          { label: 'bekir', name: 'bekir', kind: 'agent', activity: 90 },
        ],
      })],
    }));
    expect(rows[0].actions).toEqual(['focus', 'detach']);
    expect(rows[1].actions).toEqual(['focus', 'close']);
  });
});

describe('composeSessionRows ssh tabs', () => {
  it('lists an ssh tab as its own active row with no session', () => {
    const [row] = composeSessionRows(snapshot({
      ssh: [{ label: 'build-01', host: 'build-01', destination: 'build-01', activity: 70 }],
    }));
    expect(row).toMatchObject({ kind: 'ssh', name: 'ssh', state: 'active', joined: false });
    expect(row.session).toBeUndefined();
  });

  // No janissary peer behind it, so there is nothing to park and nothing to come back to.
  it('offers an ssh row focus and close and nothing else', () => {
    const [row] = composeSessionRows(snapshot({
      ssh: [{ label: 'build-01', host: 'build-01', destination: 'build-01', activity: 70 }],
    }));
    expect(row.actions).toEqual(['focus', 'close']);
  });
});

describe('composeSessionRows detached records', () => {
  it('contributes one row per process still alive on the peer', () => {
    const rows = composeSessionRows(snapshot({
      detached: [{
        record: record({
          processes: [
            { id: 'spawn-1', label: 'claude-2', kind: 'harness' },
            { id: 'spawn-2', label: 'bekir-2', kind: 'agent' },
          ],
        }),
      }],
    }));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.state)).toEqual(['detached', 'detached']);
    expect(rows.map((row) => row.name)).toEqual(['claude-2', 'bekir-2']);
  });

  it('keys each row on the session and the spawn id, so two peers never collide', () => {
    const rows = composeSessionRows(snapshot({ detached: [{ record: record() }] }));
    expect(rows[0].id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:spawn-1');
    expect(rows[0].session).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('offers reattach and end on the launching row', () => {
    const rows = composeSessionRows(snapshot({ detached: [{ record: record() }] }));
    expect(rows[0].actions).toEqual(['reattach', 'end']);
  });

  // One ssh connection serves the whole session, so the rows are a view of one thing: pressing
  // reattach on any of them brings the peer back.
  it('offers reattach alone on a joined row', () => {
    const rows = composeSessionRows(snapshot({
      detached: [{
        record: record({
          processes: [
            { id: 'spawn-1', label: 'claude-2', kind: 'harness' },
            { id: 'spawn-2', label: 'bekir-2', kind: 'agent' },
          ],
        }),
      }],
    }));
    expect(rows[1].actions).toEqual(['reattach']);
  });

  // "Forget this" must not be the easy way past a session that is merely slow to answer.
  it('offers no trash button until an attempt has failed to reach the host', () => {
    const rows = composeSessionRows(snapshot({ detached: [{ record: record() }] }));
    expect(rows[0].actions).not.toContain('forget');
    expect(rows[0].failure).toBeUndefined();
  });

  it('earns the trash button once an attempt has failed, and reports what failed', () => {
    const rows = composeSessionRows(snapshot({
      detached: [{ record: record(), failure: 'devbox: Connection timed out' }],
    }));
    expect(rows[0].actions).toEqual(['reattach', 'end', 'forget']);
    expect(rows[0].failure).toBe('devbox: Connection timed out');
  });

  it('leaves a joined row of a failed session with reattach alone', () => {
    const rows = composeSessionRows(snapshot({
      detached: [{
        record: record({
          processes: [
            { id: 'spawn-1', label: 'claude-2', kind: 'harness' },
            { id: 'spawn-2', label: 'bekir-2', kind: 'agent' },
          ],
        }),
        failure: 'devbox: Connection timed out',
      }],
    }));
    expect(rows[1].actions).toEqual(['reattach']);
  });
});

describe('composeSessionRows ended sessions', () => {
  it('lists an ended session with nothing on offer but clearing the row', () => {
    const [row] = composeSessionRows(snapshot({
      ended: [{
        session: 'cccccccc-dddd-eeee-ffff-000000000000',
        host: 'devbox',
        destination: 'devbox',
        workspace: '/srv/ws',
        label: 'claude-3',
        name: 'claude-3',
        kind: 'harness',
        activity: 10,
      }],
    }));
    expect(row.state).toBe('ended');
    expect(row.actions).toEqual(['forget']);
  });
});

describe('composeSessionRows ordering', () => {
  it('orders groups by their launching row, newest first', () => {
    const rows = composeSessionRows(snapshot({
      channels: [channel({ launchLabel: 'old', members: [{ label: 'old', name: 'old', kind: 'harness', activity: 10 }] })],
      ssh: [{ label: 'newer', host: 'build-01', destination: 'build-01', activity: 500 }],
    }));
    expect(rows.map((row) => row.label)).toEqual(['newer', 'old']);
  });

  // Sorting every row by its own activity would scatter a group across the list and hide exactly
  // what a single detach would take with it.
  it('keeps a group\'s members under their launching row regardless of their own activity', () => {
    const rows = composeSessionRows(snapshot({
      channels: [channel({
        members: [
          { label: 'claude', name: 'claude', kind: 'harness', activity: 100 },
          { label: 'bekir', name: 'bekir', kind: 'agent', activity: 900 },
        ],
      })],
      ssh: [{ label: 'build-01', host: 'build-01', destination: 'build-01', activity: 500 }],
    }));
    expect(rows.map((row) => row.label)).toEqual(['build-01', 'claude', 'bekir']);
  });

  it('interleaves live, detached, and ended groups on one activity ordering', () => {
    const rows = composeSessionRows(snapshot({
      channels: [channel({ members: [{ label: 'claude', name: 'claude', kind: 'harness', activity: 300 }] })],
      detached: [{ record: record({ activity: 400 }) }],
      ended: [{
        session: 'cccccccc-dddd-eeee-ffff-000000000000',
        host: 'devbox', destination: 'devbox', workspace: '/srv/ws',
        label: 'gone', name: 'gone', kind: 'harness', activity: 200,
      }],
    }));
    expect(rows.map((row) => row.state)).toEqual(['detached', 'active', 'ended']);
  });

  it('composes nothing from an empty snapshot', () => {
    expect(composeSessionRows(snapshot())).toEqual([]);
  });

  it('drops a channel that holds no tabs at all rather than emitting a headless group', () => {
    expect(composeSessionRows(snapshot({ channels: [channel({ members: [] })] }))).toEqual([]);
  });
});
