import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiffSession } from './session.js';
import { readChangeSet } from './change-set.js';
import type { ChangeSetResult } from './change-set.js';
import type { DiffFile, DiffPayload } from './shared.js';

vi.mock('./change-set.js', () => ({ readChangeSet: vi.fn() }));
const read = vi.mocked(readChangeSet);
beforeEach(() => { vi.resetAllMocks(); });

const file = (overrides: Partial<DiffFile> = {}): DiffFile => ({
  path: 'a.ts', additions: 1, deletions: 1,
  hunks: [{ oldStart: 1, newStart: 1, lines: [
    { kind: 'context', number: 1, jump: 1, text: 'const kept = 0;' },
    { kind: 'removed', number: 2, jump: 2, text: 'const value = 1;' },
    { kind: 'added', number: 2, jump: 2, text: 'const value = 2;' },
  ] }], ...overrides,
});
const result = (value = file()): ChangeSetResult => ({ kind: 'files', files: [value] });

// The one project-root diff tab, addressed by the instance key the session always gives it.
const KEY = 'diff';

function host() {
  const updates: DiffPayload[] = [];
  let opened = false;
  const rejectRequest = vi.fn((reason: string) => { throw new Error(reason); });
  const capabilities = {
    readSettings: () => ({}), saveSettings: () => true,
    openOrFocusTab: vi.fn((_key: string, factory: () => { payload: DiffPayload }) => {
      if (opened) return;
      opened = true;
      factory();
    }),
    updateTab: (_key: string, factory: () => { payload: DiffPayload }) => { updates.push(factory().payload); },
    rejectRequest,
  };
  return {
    capabilities, session: new DiffSession(capabilities as never), updates, rejectRequest,
    close: () => { opened = false; },
  };
}

async function loaded(record = file()) {
  read.mockResolvedValueOnce(result(record));
  const value = host();
  value.session.open('/project/one', { root: '/project/one' });
  await vi.waitFor(() => { expect(value.updates.at(-1)?.files).toHaveLength(1); });
  return value;
}

describe('diff full-file session', () => {
  it.each([{ binary: true }, { added: true }, { deleted: true }, { hunks: [] }])
    ('rejects full-file view for an ineligible record: %j', async (overrides) => {
      const { session } = await loaded(file(overrides));
      expect(() => session.setFullFile(KEY, 'a.ts', true)).toThrow('outside the current text diff');
      expect(read).toHaveBeenCalledTimes(1);
      session.dispose();
    });

  it('keeps the expanded file through refresh and resets when the tab is reopened', async () => {
    const { session, close, capabilities } = await loaded();
    read.mockResolvedValueOnce(result(file({ contextLines: 1_000_000 })));
    session.setFullFile(KEY, 'a.ts', true);
    await vi.waitFor(() => { expect(read.mock.calls.at(-1)?.[1]?.has('a.ts')).toBe(true); });
    read.mockResolvedValueOnce(result(file({ contextLines: 1_000_000 })));
    await session.refresh(KEY, capabilities);
    expect(read.mock.calls.at(-1)?.[1]?.has('a.ts')).toBe(true);
    close();
    read.mockResolvedValueOnce(result());
    session.open('/project/one', { root: '/project/one' });
    await vi.waitFor(() => { expect(read.mock.calls.at(-1)?.[1]?.size).toBe(0); });
    session.dispose();
  });

  it('queues a full-file request during a refresh', async () => {
    const { session, updates, capabilities } = await loaded();
    const pending = Promise.withResolvers<ChangeSetResult>();
    read.mockReturnValueOnce(pending.promise).mockResolvedValue(result(file({ contextLines: 1_000_000 })));
    const refresh = session.refresh(KEY, capabilities);
    session.setFullFile(KEY, 'a.ts', true);
    expect(updates.at(-1)?.files[0].expandingContext).toBe(true);
    pending.resolve(result());
    await refresh;
    await vi.waitFor(() => { expect(read.mock.calls.at(-1)?.[1]?.has('a.ts')).toBe(true); });
    session.dispose();
  });

  it('discards a stale root read and clears full-file settings on rescope', async () => {
    const { session, capabilities } = await loaded();
    const pending = Promise.withResolvers<ChangeSetResult>();
    read.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result(file({ path: 'b.ts' })));
    const refresh = session.refresh(KEY, capabilities);
    session.setFullFile(KEY, 'a.ts', true);
    session.open('/project/two', { root: '/project/two' });
    pending.resolve(result(file({ contextLines: 1_000_000 })));
    await refresh;
    await vi.waitFor(() => { expect(read.mock.calls.at(-1)?.[0]).toBe('/project/two'); });
    expect(read.mock.calls.at(-1)?.[1]?.size).toBe(0);
    session.dispose();
  });

  it('keeps displayed hunks after a failed expansion and permits retry', async () => {
    const { session, updates } = await loaded();
    const previous = updates.at(-1)!.files[0];
    read.mockResolvedValueOnce(result(file({ contextLines: 1_000_000, contextError: 'Git failed' })));
    session.setFullFile(KEY, 'a.ts', true);
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0].contextError).toBe('Git failed'); });
    expect(updates.at(-1)?.files[0].hunks).toEqual(previous.hunks);
    expect(updates.at(-1)?.files[0].expandingContext).toBe(false);
    read.mockResolvedValueOnce(result(file({ contextLines: 1_000_000 })));
    session.setFullFile(KEY, 'a.ts', true);
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0].contextError).toBeUndefined(); });
    session.dispose();
  });

  it('rejects an unrecorded path and ignores duplicate requests while pending', async () => {
    const { session } = await loaded();
    expect(() => session.setFullFile(KEY, '../escape.ts', true)).toThrow('outside the current text diff');
    const pending = Promise.withResolvers<ChangeSetResult>();
    read.mockReturnValueOnce(pending.promise);
    session.setFullFile(KEY, 'a.ts', true);
    session.setFullFile(KEY, 'a.ts', true);
    expect(read).toHaveBeenCalledTimes(2);
    pending.resolve(result(file({ contextLines: 1_000_000 })));
    await vi.waitFor(() => { expect(read.mock.calls.at(-1)?.[1]?.has('a.ts')).toBe(true); });
    session.dispose();
  });
});
