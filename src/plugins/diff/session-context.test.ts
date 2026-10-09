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
  return { session: new DiffSession(capabilities as never), updates, rejectRequest, close: () => { opened = false; } };
}

async function loaded(record = file()) {
  read.mockResolvedValueOnce(result(record));
  const value = host();
  value.session.open('/project/one', { root: '/project/one' });
  await vi.waitFor(() => { expect(value.updates.at(-1)?.files).toHaveLength(1); });
  return value;
}

describe('diff context session', () => {
  it.each([{ binary: true }, { added: true }, { deleted: true }, { hunks: [] }])
    ('rejects expansion for a non-expandable record: %j', async (overrides) => {
      const { session } = await loaded(file(overrides));
      expect(() => session.expandContext('a.ts')).toThrow('outside the current text diff');
      expect(read).toHaveBeenCalledTimes(1);
      session.dispose();
    });

  it('clears expanded context when a closed tab is opened again on the same root', async () => {
    const { session, updates, close } = await loaded();
    read.mockResolvedValueOnce(result(file({ contextLines: 23, canExpandContext: true })));
    session.expandContext('a.ts');
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0].contextLines).toBe(23); });
    close();
    read.mockResolvedValueOnce(result());
    session.open('/project/one', { root: '/project/one' });
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0]?.contextLines).toBeUndefined(); });
    expect(read.mock.calls.at(-1)?.[1]?.size).toBe(0);
    session.dispose();
  });

  it('queues expansion requested during a refresh and keeps it through later refreshes', async () => {
    const { session, updates } = await loaded();
    const pending = Promise.withResolvers<ChangeSetResult>();
    read.mockReturnValueOnce(pending.promise).mockResolvedValue(result(file({ contextLines: 23, canExpandContext: true })));
    const refresh = session.refresh();
    session.expandContext('a.ts');
    expect(updates.at(-1)?.files[0].expandingContext).toBe(true);
    pending.resolve(result());
    await refresh;
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0].contextLines).toBe(23); });
    expect(read.mock.calls[2][1]?.get('a.ts')).toBe(23);
    await session.refresh();
    expect(read.mock.calls.at(-1)?.[1]?.get('a.ts')).toBe(23);
    session.dispose();
  });

  it('discards a stale root read and computes the newly scoped root with no expansion settings', async () => {
    const { session, updates } = await loaded();
    const pending = Promise.withResolvers<ChangeSetResult>();
    read.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result(file({ path: 'b.ts' })));
    const refresh = session.refresh();
    session.expandContext('a.ts');
    session.open('/project/two', { root: '/project/two' });
    pending.resolve(result(file({ contextLines: 23 })));
    await refresh;
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0]?.path).toBe('b.ts'); });
    expect(read.mock.calls.at(-1)?.[0]).toBe('/project/two');
    expect(read.mock.calls.at(-1)?.[1]?.size).toBe(0);
    session.dispose();
  });

  it('retains displayed hunks on an expansion failure and allows a successful retry', async () => {
    const { session, updates } = await loaded();
    const previous = updates.at(-1)!.files[0];
    read.mockResolvedValueOnce(result(file({ hunks: [], contextLines: 23, contextError: 'Git failed' })));
    session.expandContext('a.ts');
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0].contextError).toBe('Git failed'); });
    expect(updates.at(-1)?.files[0].hunks).toEqual(previous.hunks);
    expect(updates.at(-1)?.files[0].expandingContext).toBe(false);
    read.mockResolvedValueOnce(result(file({ contextLines: 23, canExpandContext: false })));
    session.expandContext('a.ts');
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0].canExpandContext).toBe(false); });
    expect(updates.at(-1)?.files[0].contextError).toBeUndefined();
    session.dispose();
  });

  it('rejects an unrecorded path without starting any Git read', async () => {
    const { session } = await loaded();
    expect(() => session.expandContext('../escape.ts')).toThrow('outside the current text diff');
    expect(read).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it('ignores another expansion while pending and stops at exhausted context', async () => {
    const { session, updates } = await loaded();
    const pending = Promise.withResolvers<ChangeSetResult>();
    read.mockReturnValueOnce(pending.promise);
    session.expandContext('a.ts');
    session.expandContext('a.ts');
    expect(read).toHaveBeenCalledTimes(2);
    pending.resolve(result(file({ contextLines: 23, canExpandContext: false })));
    await vi.waitFor(() => { expect(updates.at(-1)?.files[0].canExpandContext).toBe(false); });
    session.expandContext('a.ts');
    expect(read).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it('does not publish or queue a new read after disposal', async () => {
    const { session, updates } = await loaded();
    const pending = Promise.withResolvers<ChangeSetResult>();
    read.mockReturnValueOnce(pending.promise);
    const refresh = session.refresh();
    session.expandContext('a.ts');
    session.dispose();
    const before = updates.length;
    pending.resolve(result());
    await refresh;
    expect(updates).toHaveLength(before);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
