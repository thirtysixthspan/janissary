import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { formatDispatchedCommand, formatEchoedCommand } from './format-dispatched-command';
import { insertMarkdownBlock } from './markdown-block';
import { markdownToAnsi } from './markdown-to-ansi';
import { ReplyPlacement } from './reply-placement';
import { commandHead } from './shell-prompt';
import { writeShellEcho, writeShellReply } from './write-shell-reply';

vi.mock('./markdown-block', () => ({ insertMarkdownBlock: vi.fn() }));

const insertBlock = vi.mocked(insertMarkdownBlock);

type Written = { data: string; args: number; callback: (() => void) | undefined };
type BufferOptions = { type?: string; baseY?: number; cursorY?: number; wrapped?: boolean[] };

function fakeTerminal({ type = 'normal', baseY = 0, cursorY = 0, wrapped = [] }: BufferOptions = {}) {
  const writes: Written[] = [];
  const held: (() => void)[] = [];
  const reads: number[] = [];
  const offsets: number[] = [];
  const hold = { on: false };
  const active = {
    type,
    baseY,
    cursorY,
    getLine: (row: number) => {
      reads.push(row);
      return row >= 0 && row < wrapped.length ? { isWrapped: wrapped[row] } : undefined;
    },
  };
  const terminal = {
    buffer: { active },
    write: (...args: [string, (() => void)?]) => {
      writes.push({ data: args[0], args: args.length, callback: args[1] });
      if (!args[1]) return;
      if (hold.on) held.push(args[1]);
      else args[1]();
    },
    registerMarker: (offset: number) => {
      offsets.push(offset);
      return { line: baseY + cursorY + offset };
    },
  } as unknown as Terminal;
  const release = () => {
    const callbacks = [...held];
    held.length = 0;
    for (const callback of callbacks) callback();
  };
  return { terminal, writes, reads, offsets, hold, release };
}

type Fake = ReturnType<typeof fakeTerminal>;

function blockSees(fake: Fake, accepted: boolean): { head: string | undefined; writes: number }[] {
  const seen: { head: string | undefined; writes: number }[] = [];
  insertBlock.mockImplementation((_terminal, head) => {
    seen.push({ head, writes: fake.writes.length });
    return accepted;
  });
  return seen;
}

const OFFSET_CASES: { name: string; buffer: BufferOptions; offset: number; reads: number[] }[] = [
  { name: 'a line on one row', buffer: { cursorY: 2, wrapped: [false, false] }, offset: -1, reads: [1] },
  { name: 'a line on three rows', buffer: { cursorY: 3, wrapped: [false, true, true] }, offset: -3, reads: [2, 1] },
  {
    name: 'a line whose own first row lies beneath wrapped rows of earlier output',
    buffer: { cursorY: 3, wrapped: [true, false, true] },
    offset: -2,
    reads: [2, 1],
  },
  { name: 'rows that are all wrapped, which ends the walk at row 0', buffer: { cursorY: 3, wrapped: [true, true, true] }, offset: -3, reads: [2, 1] },
  { name: 'a row the buffer does not return', buffer: { cursorY: 3, wrapped: [] }, offset: -1, reads: [2] },
  {
    name: 'a scrolled buffer, read by absolute row',
    buffer: { baseY: 40, cursorY: 9, wrapped: Array.from({ length: 49 }, (_, row) => row === 48) },
    offset: -2,
    reads: [48, 47],
  },
  { name: 'a cursor on row 0, where no row is read', buffer: { cursorY: 0, wrapped: [] }, offset: -1, reads: [] },
];

describe('writeShellEcho', () => {
  beforeEach(() => { insertBlock.mockReset(); });

  it('writes the echo as a single plain write when there is no marker handler', () => {
    const fake = fakeTerminal();

    expect(writeShellEcho(fake.terminal, new ReplyPlacement(), 'acp hello')).toBe(true);

    expect(fake.writes).toEqual([{ data: formatEchoedCommand('acp hello'), args: 1, callback: undefined }]);
  });

  it('skips an echo whose reply was written first, and tells no one', () => {
    const withMarker = fakeTerminal();
    const withoutMarker = fakeTerminal();
    const first = new ReplyPlacement();
    first.reply('acp reset');
    const second = new ReplyPlacement();
    second.reply('acp reset');
    const onMarker = vi.fn();

    expect(writeShellEcho(withMarker.terminal, first, 'acp reset', onMarker)).toBe(false);
    expect(writeShellEcho(withoutMarker.terminal, second, 'acp reset')).toBe(false);

    expect(withMarker.writes).toEqual([]);
    expect(withoutMarker.writes).toEqual([]);
    expect(onMarker).not.toHaveBeenCalled();
  });

  it('takes the marker only once the echo has been parsed', () => {
    const fake = fakeTerminal({ cursorY: 2, wrapped: [false, false] });
    fake.hold.on = true;
    const onMarker = vi.fn();

    writeShellEcho(fake.terminal, new ReplyPlacement(), 'acp hello', onMarker);

    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toMatchObject({ data: formatEchoedCommand('acp hello'), args: 2 });
    expect(fake.offsets).toEqual([]);
    expect(onMarker).not.toHaveBeenCalled();

    fake.release();

    expect(fake.offsets).toEqual([-1]);
    expect(onMarker).toHaveBeenCalledOnce();
    expect(onMarker).toHaveBeenCalledWith({ line: 1 });
  });

  it.each(OFFSET_CASES)('places the marker on the first row of the line for $name', ({ buffer, offset, reads }) => {
    const fake = fakeTerminal(buffer);
    const onMarker = vi.fn();

    writeShellEcho(fake.terminal, new ReplyPlacement(), 'acp hello', onMarker);

    expect(fake.offsets).toEqual([offset]);
    expect(fake.reads).toEqual(reads);
    expect(onMarker).toHaveBeenCalledOnce();
  });

  it('registers nothing and tells no one while the alternate buffer is active', () => {
    const fake = fakeTerminal({ type: 'alternate', cursorY: 2, wrapped: [false, true] });
    const onMarker = vi.fn();

    expect(writeShellEcho(fake.terminal, new ReplyPlacement(), 'acp hello', onMarker)).toBe(true);

    expect(fake.writes).toHaveLength(1);
    expect(fake.offsets).toEqual([]);
    expect(fake.reads).toEqual([]);
    expect(onMarker).not.toHaveBeenCalled();
  });
});

describe('writeShellReply', () => {
  beforeEach(() => { insertBlock.mockReset(); });

  it('reports that a reply beneath its own echo wrote no line of its own', () => {
    const fake = fakeTerminal();
    const seen = blockSees(fake, true);
    const placement = new ReplyPlacement();
    placement.echo('acp hello');

    expect(writeShellReply(fake.terminal, placement, 'acp hello', 'Done', vi.fn())).toBe(false);

    expect(seen).toEqual([{ head: undefined, writes: 0 }]);
  });

  it('reports that a reply which repeats its line wrote it', () => {
    const fake = fakeTerminal();
    const seen = blockSees(fake, true);

    expect(writeShellReply(fake.terminal, new ReplyPlacement(), 'help', 'Done', vi.fn())).toBe(true);

    expect(seen).toEqual([{ head: 'help', writes: 0 }]);
  });

  it('writes a declined repeated line in one write with its body when no marker is wanted', () => {
    const fake = fakeTerminal();
    blockSees(fake, false);

    writeShellReply(fake.terminal, new ReplyPlacement(), 'help', 'Done', vi.fn());

    expect(fake.writes).toEqual([{ data: formatDispatchedCommand('help', markdownToAnsi('Done')), args: 1, callback: undefined }]);
  });

  it('writes the repeated line first and on its own when a marker is wanted', () => {
    const fake = fakeTerminal({ cursorY: 2, wrapped: [false, true] });
    const seen = blockSees(fake, true);
    const onHeadMarker = vi.fn();

    expect(writeShellReply(fake.terminal, new ReplyPlacement(), 'help', 'Done', vi.fn(), onHeadMarker)).toBe(true);

    expect(fake.writes.map((written) => written.data)).toEqual([commandHead('help')]);
    expect(fake.writes[0]?.callback).toBeTypeOf('function');
    expect(seen).toEqual([{ head: undefined, writes: 1 }]);
    expect(fake.offsets).toEqual([-2]);
    expect(onHeadMarker).toHaveBeenCalledOnce();
    expect(onHeadMarker).toHaveBeenCalledWith({ line: 0 });
  });

  it('writes the line once and the styled body after it when the block declines', () => {
    const fake = fakeTerminal({ cursorY: 2, wrapped: [false, false] });
    const seen = blockSees(fake, false);
    const onHeadMarker = vi.fn();

    writeShellReply(fake.terminal, new ReplyPlacement(), 'help', 'Done', vi.fn(), onHeadMarker);

    expect(fake.writes.map((written) => written.data)).toEqual([
      commandHead('help'),
      formatDispatchedCommand(undefined, markdownToAnsi('Done')),
    ]);
    expect(fake.writes.filter((written) => written.data.includes('> help'))).toHaveLength(1);
    expect(fake.writes[1]).toMatchObject({ args: 1, callback: undefined });
    expect(seen).toEqual([{ head: undefined, writes: 1 }]);
    expect(onHeadMarker).toHaveBeenCalledOnce();
  });

  it('takes the head marker only once the line has been parsed', () => {
    const fake = fakeTerminal({ cursorY: 2, wrapped: [false, false] });
    fake.hold.on = true;
    blockSees(fake, true);
    const onHeadMarker = vi.fn();

    writeShellReply(fake.terminal, new ReplyPlacement(), 'help', 'Done', vi.fn(), onHeadMarker);

    expect(fake.offsets).toEqual([]);
    expect(onHeadMarker).not.toHaveBeenCalled();

    fake.release();

    expect(fake.offsets).toEqual([-1]);
    expect(onHeadMarker).toHaveBeenCalledOnce();
  });

  it('registers no head marker on the alternate buffer', () => {
    const fake = fakeTerminal({ type: 'alternate', cursorY: 2, wrapped: [false, true] });
    blockSees(fake, true);
    const onHeadMarker = vi.fn();

    writeShellReply(fake.terminal, new ReplyPlacement(), 'help', 'Done', vi.fn(), onHeadMarker);

    expect(fake.offsets).toEqual([]);
    expect(onHeadMarker).not.toHaveBeenCalled();
  });

  it('takes no head marker for a reply that continues beneath its echo', () => {
    const withMarker = fakeTerminal();
    const seen = blockSees(withMarker, false);
    const placement = new ReplyPlacement();
    placement.echo('acp hello');
    const onHeadMarker = vi.fn();

    expect(writeShellReply(withMarker.terminal, placement, 'acp hello', 'Done', vi.fn(), onHeadMarker)).toBe(false);

    expect(onHeadMarker).not.toHaveBeenCalled();
    expect(withMarker.offsets).toEqual([]);
    expect(seen).toEqual([{ head: undefined, writes: 0 }]);
    const without = fakeTerminal();
    blockSees(without, false);
    const plain = new ReplyPlacement();
    plain.echo('acp hello');
    writeShellReply(without.terminal, plain, 'acp hello', 'Done', vi.fn());
    expect(withMarker.writes).toEqual(without.writes);
    expect(withMarker.writes).toEqual([{ data: formatDispatchedCommand(undefined, markdownToAnsi('Done')), args: 1, callback: undefined }]);
  });

  it('strips terminal controls from the line before the block and the fallback see it', () => {
    const accepted = fakeTerminal();
    const seen = blockSees(accepted, true);
    writeShellReply(accepted.terminal, new ReplyPlacement(), 'help\u{1B}[6n', 'Done', vi.fn());
    expect(seen).toEqual([{ head: 'help', writes: 0 }]);

    const declined = fakeTerminal();
    blockSees(declined, false);
    writeShellReply(declined.terminal, new ReplyPlacement(), 'help\u{1B}[6n', 'Done', vi.fn());
    expect(declined.writes.map((written) => written.data)).toEqual([formatDispatchedCommand('help', markdownToAnsi('Done'))]);
  });

  it('strips terminal controls from the line it writes on its own', () => {
    const fake = fakeTerminal({ cursorY: 2, wrapped: [false, false] });
    blockSees(fake, false);

    writeShellReply(fake.terminal, new ReplyPlacement(), 'help\u{1B}[6n', 'Done', vi.fn(), vi.fn());

    expect(fake.writes[0]?.data).toBe(commandHead('help'));
    expect(fake.writes.some((written) => written.data.includes('\u{1B}[6n'))).toBe(false);
  });
});
