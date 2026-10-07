import { describe, expect, it } from 'vitest';
import type { AcpRef, ConnectionView, ScheduleView } from '../../protocol.js';
import type { CompletionResult } from '../../completion/types.js';
import {
  isEmptyShellIntent, isShellCompleteRequest, isShellCwd, isShellDispatch, isShellMarkerNonce, isShellPayload,
  SHELL_PAYLOAD_SCHEMA_VERSION, type ShellCompletion,
} from './shared.js';

const PAYLOAD = {
  instanceKey: 'shell-1', ptyId: 'pty1', cwd: '/repo', root: '/repo', workspace: false, cols: 80, rows: 24,
  connections: [], schedule: [], hookNonce: 'f'.repeat(32),
};

// The plugin's shared contract declares nothing it can import, so the two row types it re-declares
// are pinned against the protocol's own here. Without this the copy is free to drift, and a row the
// host produced would fail the plugin's guard — disabling the plugin on a shape the host itself made.
describe('shell shared contract', () => {
  it('declares a payload schema version the host can compare', () => {
    expect(SHELL_PAYLOAD_SCHEMA_VERSION).toBe(4);
  });

  it('accepts a terminal payload and a provisioning payload, and nothing mixing the two', () => {
    const common = {
      instanceKey: 'shell-1', cwd: '/repo', root: '/repo', workspace: true, workspaceDir: '/repo/.janissary/workspace/a',
      connections: [], schedule: [], hookNonce: 'f'.repeat(32),
    };
    const provisioning = { ...common, provisioning: true };

    expect(isShellPayload(PAYLOAD)).toBe(true);
    expect(isShellPayload(provisioning)).toBe(true);
    expect(isShellPayload({ ...PAYLOAD, provisioning: true })).toBe(false);
    expect(isShellPayload({ ...provisioning, ptyId: 'pty1' })).toBe(false);
    expect(isShellPayload({ ...PAYLOAD, provisioning: false })).toBe(false);
    expect(isShellPayload(common)).toBe(false);
  });

  it('accepts a remote provisioning payload without a workspace path and only there carries connectPtyId', () => {
    const remoteProvisioning = {
      instanceKey: 'shell-1', cwd: '/repo', root: '/repo', workspace: true,
      connections: [], schedule: [], hookNonce: 'f'.repeat(32), provisioning: true,
      connectPtyId: 'ssh-pty', host: 'devbox',
    };

    expect(isShellPayload(remoteProvisioning)).toBe(true);
    expect(isShellPayload({ ...PAYLOAD, connectPtyId: 'ssh-pty' })).toBe(false);
    expect(isShellPayload({ ...remoteProvisioning, connectPtyId: 4 })).toBe(false);
  });

  it('keeps its completion result assignable to and from the application result', () => {
    const completion: CompletionResult = { matches: ['ls', 'lsof'], newInput: 'ls', newCursor: 2 };
    const shellCompletion: ShellCompletion = completion;
    const roundTrip: CompletionResult = shellCompletion;

    expect(roundTrip).toEqual(completion);
  });

  it('accepts every ConnectionView the protocol admits', () => {
    const rows: ConnectionView[] = [
      { text: 'zsh', kind: 'terminal' },
      { text: 'shell', kind: 'shell' },
      { text: 'acp:opencode', kind: 'acp' },
      { text: 'ssh:devbox', kind: 'ssh' },
      { text: 'browser', kind: 'browser' },
      { text: 'main.db', kind: 'sqlite' },
      { text: 'acp:opencode', kind: 'acp', acpRef: { scope: 'tab', label: 'janus' } },
      {
        text: 'reviewer (acp)',
        kind: 'acp',
        acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' },
      },
    ];

    for (const row of rows) {
      expect(isShellPayload({ ...PAYLOAD, connections: [row] })).toBe(true);
    }
  });

  it('declares an AcpRef that is the protocol\'s discriminated union, not a flattened field', () => {
    const refs: AcpRef[] = [
      { scope: 'tab', label: 'janus' },
      { scope: 'editor', label: 'notes', persona: 'reviewer' },
    ];

    for (const ref of refs) {
      expect(isShellPayload({ ...PAYLOAD, connections: [{ text: 'x', kind: 'acp', acpRef: ref }] })).toBe(true);
    }
    // An editor-scoped reference with no persona is not a reference the protocol can express, so the
    // copy must refuse it too rather than widening what the row may carry.
    expect(isShellPayload({
      ...PAYLOAD,
      connections: [{ text: 'x', kind: 'acp', acpRef: { scope: 'editor', label: 'notes' } }],
    })).toBe(false);
  });

  it('accepts every ScheduleView the protocol admits', () => {
    const rows: ScheduleView[] = [
      { id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true },
      { id: 's2', spec: 'at 17:00', next: 'today 17:00', recurring: false },
    ];

    for (const row of rows) {
      expect(isShellPayload({ ...PAYLOAD, schedule: [row] })).toBe(true);
    }
  });

  it('rejects a row whose kind is not one the protocol admits', () => {
    expect(isShellPayload({ ...PAYLOAD, connections: [{ text: 'x', kind: 'ftp' }] })).toBe(false);
  });

  it('rejects a payload missing any field it declares', () => {
    for (const field of [
      'instanceKey', 'ptyId', 'cwd', 'workspace', 'cols', 'rows', 'connections', 'schedule',
    ] as const) {
      const partial: Record<string, unknown> = { ...PAYLOAD };
      delete partial[field];
      expect(isShellPayload(partial)).toBe(false);
    }
  });

  it('rejects a field of the wrong type', () => {
    expect(isShellPayload({ ...PAYLOAD, cols: '80' })).toBe(false);
    expect(isShellPayload({ ...PAYLOAD, workspace: 'yes' })).toBe(false);
    expect(isShellPayload({ ...PAYLOAD, commandRunning: 'yes' })).toBe(false);
  });

  it('requires a well-formed hook nonce, since the server mints one with every shell', () => {
    expect(isShellPayload({ ...PAYLOAD, hookNonce: '0123456789abcdef'.repeat(2) })).toBe(true);
    expect(isShellPayload({ ...PAYLOAD, hookNonce: undefined })).toBe(false);
    expect(isShellPayload({ ...PAYLOAD, hookNonce: 'n0nce' })).toBe(false);
    expect(isShellPayload({ ...PAYLOAD, hookNonce: 7 })).toBe(false);
  });

  it('accepts a marker nonce only in the shape the client mints', () => {
    expect(isShellMarkerNonce('0123456789abcdef'.repeat(2))).toBe(true);
    expect(isShellMarkerNonce('0123456789ABCDEF'.repeat(2))).toBe(false);
    expect(isShellMarkerNonce('0'.repeat(33))).toBe(false);
    expect(isShellMarkerNonce(`${'0'.repeat(31)};`)).toBe(false);
    expect(isShellMarkerNonce(undefined)).toBe(false);
  });

  it('rejects an array and null, which are not a payload', () => {
    expect(isShellPayload([PAYLOAD])).toBe(false);
    expect(isShellPayload(null)).toBe(false);
    expect(isShellPayload(undefined)).toBe(false);
  });

  it('treats an absent or null intent payload as the empty one it describes', () => {
    expect(isEmptyShellIntent(undefined)).toBe(true);
    expect(isEmptyShellIntent(null)).toBe(true);
    expect(isEmptyShellIntent({})).toBe(false);
    expect(isEmptyShellIntent('')).toBe(false);
  });

  it('accepts a dispatch request that is a line and refuses anything else', () => {
    expect(isShellDispatch('ls -la')).toBe(true);
    expect(isShellDispatch('')).toBe(true);
    expect(isShellDispatch({ line: 'ls' })).toBe(false);
    expect(isShellDispatch(undefined)).toBe(false);
  });

  it('accepts a completion request carrying both a line and a cursor, and refuses a half one', () => {
    expect(isShellCompleteRequest({ line: 'l', cursor: 1 })).toBe(true);
    expect(isShellCompleteRequest({ line: 'l' })).toBe(false);
    expect(isShellCompleteRequest({ cursor: 1 })).toBe(false);
    expect(isShellCompleteRequest({ line: 'l', cursor: '1' })).toBe(false);
  });

  it('accepts a reported cwd only as an absolute path already in normal form', () => {
    expect(isShellCwd('/')).toBe(true);
    expect(isShellCwd('/repo/sub')).toBe(true);
    expect(isShellCwd('/repo/.hidden')).toBe(true);
    expect(isShellCwd('relative/path')).toBe(false);
    expect(isShellCwd('/repo/a/../../etc')).toBe(false);
    expect(isShellCwd('/repo/..')).toBe(false);
    expect(isShellCwd('/repo/./sub')).toBe(false);
    expect(isShellCwd('/repo//sub')).toBe(false);
    expect(isShellCwd('/repo/')).toBe(false);
    expect(isShellCwd(7)).toBe(false);
  });
});
