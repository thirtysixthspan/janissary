import { describe, it, expect, vi } from 'vitest';
import type { TabPluginServerCapabilities } from '../api.js';
import { readRemoteChangeSet } from './remote-change-set.js';
import type { DiffFile } from './shared.js';

// The boundary between another process's JSON and the payload the tab publishes. The answer crossed a
// channel, so it is a value this plugin did not produce — checked before it is believed, and answered
// as the tab's error state when it is not one it recognises.

const UNUSABLE = 'The remote host did not answer with a change set.';

function fileRecord(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'a.txt', additions: 1, deletions: 0,
    hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: 'added', number: 1, jump: 1, text: 'a' }] }],
    ...overrides,
  };
}

function capabilitiesAnswering(answer: unknown | Promise<unknown> | null) {
  const readWorkspaceChangeSet = vi.fn(() => (answer === null ? null : answer));
  return {
    readWorkspaceChangeSet,
    capabilities: { readWorkspaceChangeSet } as unknown as TabPluginServerCapabilities,
  };
}

describe('readRemoteChangeSet', () => {
  it('passes a well-formed files answer through as the change set the tab shows', async () => {
    const answer = { kind: 'files', files: [fileRecord()] };
    const { capabilities, readWorkspaceChangeSet } = capabilitiesAnswering(Promise.resolve(answer));

    expect(await readRemoteChangeSet(capabilities, new Set())).toEqual(answer);
    expect(readWorkspaceChangeSet).toHaveBeenCalledWith([]);
  });

  it('asks the far side for the whole-file contexts this read is expanding', async () => {
    const { capabilities, readWorkspaceChangeSet } = capabilitiesAnswering(
      Promise.resolve({ kind: 'files', files: [] }),
    );

    await readRemoteChangeSet(capabilities, new Set(['b.txt', 'c.txt']));
    expect(readWorkspaceChangeSet).toHaveBeenCalledWith(['b.txt', 'c.txt']);
  });

  it('passes a not-repository answer through, rather than reporting a failure', async () => {
    const { capabilities } = capabilitiesAnswering(Promise.resolve({ kind: 'not-repository' }));

    expect(await readRemoteChangeSet(capabilities, new Set())).toEqual({ kind: 'not-repository' });
  });

  it('passes an error answer through, keeping the reason the far side gave', async () => {
    const answer = { kind: 'error', reason: 'permission denied' };
    const { capabilities } = capabilitiesAnswering(Promise.resolve(answer));

    expect(await readRemoteChangeSet(capabilities, new Set())).toEqual(answer);
  });

  it('answers the unusable reason for an answer that is not one of the three shapes', async () => {
    for (const answer of [
      undefined, null, 0, 'files',
      [], {},
      { kind: 'not-a-change-set' },
      { kind: 'files' },
      { kind: 'files', files: 'a.txt' },
      { kind: 'files', files: [{}] },
      { kind: 'files', files: [{ ...fileRecord(), additions: 'one' }] },
      { kind: 'error', reason: 42 },
      { kind: 'error' },
    ]) {
      const { capabilities } = capabilitiesAnswering(Promise.resolve(answer));
      await expect(readRemoteChangeSet(capabilities, new Set())).resolves.toEqual({ kind: 'error', reason: UNUSABLE });
    }
  });

  it('answers the unusable reason rather than a throw when a capability answers null', async () => {
    const { capabilities, readWorkspaceChangeSet } = capabilitiesAnswering(null);

    expect(await readRemoteChangeSet(capabilities, new Set())).toEqual({ kind: 'error', reason: UNUSABLE });
    expect(readWorkspaceChangeSet).toHaveBeenCalledWith([]);
  });

  it('answers the unusable reason rather than a rejection when the capability rejects', async () => {
    const failure = new Error('read ECONNRESET');
    const { capabilities } = capabilitiesAnswering(Promise.reject(failure));

    await expect(readRemoteChangeSet(capabilities, new Set())).resolves.toEqual({ kind: 'error', reason: UNUSABLE });
  });

  it('answers the unusable reason rather than a rejection when the call itself throws', async () => {
    const capabilities = {
      readWorkspaceChangeSet: vi.fn(() => { throw new Error('the channel is gone'); }),
    } as unknown as TabPluginServerCapabilities;

    await expect(readRemoteChangeSet(capabilities, new Set())).resolves.toEqual({ kind: 'error', reason: UNUSABLE });
  });
});
