import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import type { BackgroundReplyView, PendingAcpReplyNameView } from '@shared/protocol';
import type { ShellAcpReceipt, ShellConnectionRow } from '@shared/plugins/shell/shared';
import { formatDispatchedCommand, formatEchoedCommand } from './format-dispatched-command';
import { insertMarkdownBlock } from './markdown-block';
import { markdownToAnsi } from './markdown-to-ansi';
import { ReplyPlacement } from './reply-placement';
import { commandHead } from './shell-prompt';
import { addThinkingMarker } from './thinking-marker-decoration';
import { useBackgroundReplies } from './useBackgroundReplies';
import { createReplyMarkers, useShellReplyWriters } from './useShellReplyWriters';

vi.mock('./markdown-block', () => ({ insertMarkdownBlock: vi.fn() }));
vi.mock('./thinking-marker-decoration', () => ({ addThinkingMarker: vi.fn() }));

const insertBlock = vi.mocked(insertMarkdownBlock);
const addMarker = vi.mocked(addThinkingMarker);

type Props = Parameters<typeof useShellReplyWriters>[0];
type Handle = { show: Mock; remove: Mock };
type FakeMarker = { line: number; dispose: Mock };

const LINE = 'ask hello';
const RECORD = { id: 'rec-1', name: 'ask-model' };
const handles: Handle[] = [];

function fakeTerminal() {
  const writes: { data: string; args: number }[] = [];
  const held: (() => void)[] = [];
  const markers: FakeMarker[] = [];
  const hold = { on: false };
  const active = { type: 'normal', baseY: 0, cursorY: 0, getLine: vi.fn() };
  const terminal = {
    buffer: { active },
    write: (...args: [string, (() => void)?]) => {
      writes.push({ data: args[0], args: args.length });
      if (!args[1]) return;
      if (hold.on) held.push(args[1]);
      else args[1]();
    },
    registerMarker: (offset: number) => {
      const marker = { line: offset, dispose: vi.fn() };
      markers.push(marker);
      return marker;
    },
  } as unknown as Terminal;
  const release = () => {
    const callbacks = [...held];
    held.length = 0;
    for (const callback of callbacks) callback();
  };
  return { terminal, active, writes, markers, hold, release };
}

function setup(overrides: Partial<Props> = {}) {
  const fake = fakeTerminal();
  const placement = new ReplyPlacement();
  const placementRef = { current: placement };
  const markersRef = { current: createReplyMarkers() };
  const replyIds = overrides.replyIds ?? new Set<string>();
  const terminalRef = { current: fake.terminal as Terminal | null };
  const openLink = vi.fn<(href: string) => void>();
  const openConnection = vi.fn<(row: ShellConnectionRow) => void>();
  const props: Props = {
    terminalRef, placementRef, markersRef, replyIds, openLink, openConnection, label: 'shell-1', ...overrides,
  };
  const view = renderHook((current: Props) => useShellReplyWriters(current), { initialProps: props });
  return { fake, placement, placementRef, markersRef, replyIds, terminalRef, props, openLink, openConnection, ...view };
}

function receipt(replyId: string, role: ShellAcpReceipt['role'] = 'ask', name = 'ask-model'): ShellAcpReceipt {
  return { replyId, role, name };
}

function viewOf(call: number) {
  const view = addMarker.mock.calls[call]?.[2];
  if (!view) throw new Error(`no marker was drawn as call ${String(call)}`);
  return view;
}

function written(fake: ReturnType<typeof fakeTerminal>): string[] {
  return fake.writes.map((entry) => entry.data);
}

const BODY = formatDispatchedCommand(undefined, markdownToAnsi('Done'));
const WHOLE = formatDispatchedCommand(LINE, markdownToAnsi('Done'));

beforeEach(() => {
  handles.length = 0;
  insertBlock.mockReset();
  addMarker.mockReset();
  addMarker.mockImplementation(() => {
    const handle = { show: vi.fn(), remove: vi.fn() };
    handles.push(handle);
    return handle;
  });
});

describe('useShellReplyWriters echoes', () => {
  it('draws a running view with the receipt name on the marker the echo hands back, before it returns', () => {
    const { fake, result } = setup();

    result.current.echoCommand(LINE, receipt('r1'));

    expect(fake.writes).toEqual([{ data: formatEchoedCommand(LINE), args: 2 }]);
    expect(fake.markers).toHaveLength(1);
    expect(addMarker).toHaveBeenCalledTimes(1);
    expect(addMarker).toHaveBeenCalledWith(
      fake.terminal, fake.markers[0], expect.objectContaining({ kind: 'running', name: 'ask-model', onOpen: expect.any(Function) }),
    );
  });

  it('writes an echo with no receipt as the plain one-argument write and draws nothing', () => {
    const { fake, result } = setup();

    result.current.echoCommand(LINE);

    expect(fake.writes).toEqual([{ data: formatEchoedCommand(LINE), args: 1 }]);
    expect(fake.markers).toHaveLength(0);
    expect(addMarker).not.toHaveBeenCalled();
  });

  it('draws nothing for an echo the placement skipped, and writes a later reply for that id as one plain write', () => {
    const { fake, result } = setup();
    result.current.displayReply(LINE, 'Done');

    result.current.echoCommand(LINE, receipt('r1'));

    expect(fake.writes).toHaveLength(1);
    expect(addMarker).not.toHaveBeenCalled();

    result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });

    expect(fake.writes.slice(1)).toEqual([{ data: WHOLE, args: 1 }]);
    expect(addMarker).not.toHaveBeenCalled();
  });

  it('draws nothing on the alternate buffer, and settles a later reply for its id without error or handle operation', () => {
    const { fake, result } = setup();
    fake.active.type = 'alternate';

    result.current.echoCommand(LINE, receipt('r1'));
    expect(fake.writes).toHaveLength(1);
    expect(fake.markers).toHaveLength(0);
    expect(addMarker).not.toHaveBeenCalled();

    expect(() => { result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD }); }).not.toThrow();

    expect(fake.markers).toHaveLength(0);
    expect(addMarker).not.toHaveBeenCalled();
    expect(handles).toHaveLength(0);
  });
});

describe('useShellReplyWriters settling', () => {
  it('turns the echo marker into the link in place when the reply continues beneath it', () => {
    const { fake, openConnection, result } = setup();
    result.current.echoCommand(LINE, receipt('r1'));

    result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });

    expect(addMarker).toHaveBeenCalledTimes(1);
    expect(handles[0]?.show).toHaveBeenCalledOnce();
    expect(handles[0]?.show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'link', name: 'ask-model' }));
    expect(handles[0]?.remove).not.toHaveBeenCalled();
    expect(fake.writes.slice(1)).toEqual([{ data: BODY, args: 1 }]);

    const shown = handles[0]?.show.mock.calls[0]?.[0] as { onOpen: () => void };
    shown.onOpen();
    expect(openConnection).toHaveBeenCalledWith({ text: 'ask-model', kind: 'acp', recordId: 'rec-1' });
  });

  it('puts the same link on the original echo and on the repeated line, the head being its own write', () => {
    const { fake, openConnection, placement, result } = setup();
    result.current.echoCommand(LINE, receipt('r1'));
    placement.wrote();

    result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });

    expect(written(fake)).toEqual([formatEchoedCommand(LINE), commandHead(LINE), BODY]);
    expect(fake.writes[1]?.args).toBe(2);
    expect(fake.writes[2]?.args).toBe(1);
    expect(handles[0]?.show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'link', name: 'ask-model' }));
    expect(addMarker).toHaveBeenCalledTimes(2);
    expect(addMarker).toHaveBeenLastCalledWith(
      fake.terminal, fake.markers[1], expect.objectContaining({ kind: 'link', name: 'ask-model' }),
    );

    viewOf(1).onOpen();
    expect(openConnection).toHaveBeenCalledWith({ text: 'ask-model', kind: 'acp', recordId: 'rec-1' });
  });

  it('still takes the head as a chunk of its own when the reply renders as a block', () => {
    const { fake, placement, result } = setup();
    insertBlock.mockReturnValue(true);
    result.current.echoCommand(LINE, receipt('r1'));
    placement.wrote();

    result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });

    expect(written(fake)).toEqual([formatEchoedCommand(LINE), commandHead(LINE)]);
    expect(insertBlock).toHaveBeenCalledWith(fake.terminal, undefined, 'Done', expect.any(Function));
    expect(addMarker).toHaveBeenCalledTimes(2);
  });

  it('removes the marker and writes a plain reply when the reply carries no record', () => {
    const { fake, placement, result } = setup();
    result.current.echoCommand(LINE, receipt('r1'));
    placement.wrote();

    result.current.displayReply(LINE, 'Done', { id: 'r1' });

    expect(handles[0]?.remove).toHaveBeenCalledOnce();
    expect(handles[0]?.show).not.toHaveBeenCalled();
    expect(addMarker).toHaveBeenCalledTimes(1);
    expect(fake.writes.slice(1)).toEqual([{ data: WHOLE, args: 1 }]);
  });

  it('settles two echoes of the same line by id, never by text', () => {
    const { result } = setup();
    result.current.echoCommand(LINE, receipt('r1'));
    result.current.echoCommand(LINE, receipt('r2'));
    expect(handles).toHaveLength(2);

    result.current.displayReply(LINE, 'Refused', { id: 'r1' });

    expect(handles[0]?.remove).toHaveBeenCalledOnce();
    expect(handles[1]?.remove).not.toHaveBeenCalled();
    expect(handles[1]?.show).not.toHaveBeenCalled();

    result.current.displayReply(LINE, 'Done', { id: 'r2', record: RECORD });

    expect(handles[1]?.show).toHaveBeenCalledWith(expect.objectContaining({ kind: 'link' }));
    expect(handles[0]?.show).not.toHaveBeenCalled();
    expect(handles[1]?.remove).not.toHaveBeenCalled();
  });

  it('names the link after the record even when the receipt named something else', () => {
    const { openConnection, result } = setup();
    result.current.echoCommand(LINE, receipt('r1', 'ask', 'old-name'));
    expect(viewOf(0)).toMatchObject({ kind: 'running', name: 'old-name' });

    result.current.displayReply(LINE, 'Done', { id: 'r1', record: { id: 'rec-9', name: 'new-name' } });

    const shown = handles[0]?.show.mock.calls[0]?.[0] as { name: string; onOpen: () => void };
    expect(shown.name).toBe('new-name');
    shown.onOpen();
    expect(openConnection).toHaveBeenCalledWith({ text: 'new-name', kind: 'acp', recordId: 'rec-9' });
  });
});

describe('useShellReplyWriters pending name updates', () => {
  it('refreshes the running marker name and keeps its role-based connection reference', () => {
    const { openConnection, replyIds, result } = setup();
    result.current.echoCommand(LINE, receipt('r1', 'ask', 'acp:ask:original shell'));
    let receive: (update: PendingAcpReplyNameView) => void = () => {};
    const subscribe = (callback: typeof receive) => {
      receive = callback;
      return () => {};
    };
    renderHook(() => useBackgroundReplies(undefined, result.current.displayReply, replyIds, subscribe));

    act(() => { receive({ id: 'r1', name: 'acp:ask:Renamed shell' }); });

    expect(replyIds).toEqual(new Set());
    expect(handles[0]?.show).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      kind: 'running', name: 'acp:ask:Renamed shell',
    }));
    const shown = handles[0]?.show.mock.calls[0]?.[0] as { onOpen: () => void };
    shown.onOpen();
    expect(openConnection).toHaveBeenCalledWith({
      text: 'acp:ask:Renamed shell', kind: 'acp',
      acpRef: { scope: 'tab', label: 'shell-1', role: 'ask' },
    });
  });

  it('applies a fallback name update that arrives before the dispatch receipt', () => {
    const { markersRef, openConnection, result } = setup();
    result.current.displayReply('', '', { id: 'r1', pending: true, name: 'acp:tell:Renamed shell' });

    result.current.echoCommand(LINE, receipt('r1', 'tell', 'acp:tell:original shell'));

    expect(markersRef.current.pendingNames).toBeUndefined();
    expect(markersRef.current.entries.get('r1')).toMatchObject({
      name: 'acp:tell:Renamed shell', role: 'tell',
    });
    expect(addMarker).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), expect.anything(), expect.objectContaining({ kind: 'running', name: 'acp:tell:Renamed shell' }),
    );
    viewOf(0).onOpen();
    expect(openConnection).toHaveBeenCalledWith({
      text: 'acp:tell:Renamed shell', kind: 'acp',
      acpRef: { scope: 'tab', label: 'shell-1', role: 'tell' },
    });
  });
});

describe('useShellReplyWriters ids', () => {
  it('shares early reply ids with late receipts across terminal reattachment', () => {
    const attached = setup();
    const reply: BackgroundReplyView = { id: 'r1', line: LINE, output: 'Done', record: RECORD };
    const initialSubscription = (receive: (reply: BackgroundReplyView) => void) => {
      receive(reply);
      return () => {};
    };
    const replaySubscription = (receive: (reply: BackgroundReplyView) => void) => {
      receive(reply);
      return () => {};
    };
    const { rerender } = renderHook(({ subscription }) => useBackgroundReplies(
      subscription, attached.result.current.displayReply, attached.replyIds,
    ), { initialProps: { subscription: initialSubscription } });

    const later = fakeTerminal();
    attached.markersRef.current = createReplyMarkers();
    attached.placementRef.current = new ReplyPlacement();
    attached.terminalRef.current = later.terminal;
    attached.result.current.echoCommand(LINE, receipt('r1'));

    expect(attached.replyIds).toEqual(new Set(['r1']));
    expect(later.writes).toEqual([{ data: formatEchoedCommand(LINE), args: 1 }]);
    expect(later.markers).toHaveLength(0);
    expect(addMarker).not.toHaveBeenCalled();

    rerender({ subscription: replaySubscription });

    expect(later.writes).toHaveLength(1);
    expect(attached.markersRef.current).toEqual({ entries: new Map() });
  });

  it('keeps unrelated monitor reply ids in the shared tracker only', () => {
    const { fake, markersRef, replyIds, result } = setup();
    const monitorReplies: BackgroundReplyView[] = [
      { id: 'monitor-1', output: 'First suggestion' },
      { id: 'monitor-2', output: 'Second suggestion' },
    ];
    let receive: (reply: BackgroundReplyView) => void = () => {};
    const subscribe = (callback: typeof receive) => {
      receive = callback;
      return () => {};
    };
    renderHook(() => useBackgroundReplies(subscribe, result.current.displayReply, replyIds));

    act(() => {
      for (const reply of monitorReplies) receive(reply);
    });

    expect(replyIds).toEqual(new Set(['monitor-1', 'monitor-2']));
    expect(markersRef.current).toEqual({ entries: new Map() });
    expect(markersRef.current).not.toHaveProperty('written');
    expect(fake.writes).toHaveLength(2);
  });

  it('writes a reply for an unknown id exactly as a plain reply, and writes a late receipt for it with no marker', () => {
    const plain = setup();
    plain.result.current.displayReply(LINE, 'Done');
    const keyed = setup();

    keyed.result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });

    expect(keyed.fake.writes).toEqual(plain.fake.writes);
    expect(keyed.fake.writes).toEqual([{ data: WHOLE, args: 1 }]);
    expect(addMarker).not.toHaveBeenCalled();

    keyed.placement.wrote();
    keyed.result.current.echoCommand(LINE, receipt('r1'));

    expect(keyed.fake.writes.at(-1)).toEqual({ data: formatEchoedCommand(LINE), args: 1 });
    expect(addMarker).not.toHaveBeenCalled();
  });

  it('writes a second delivery of an id already waiting with no handler and leaves the first handle alone', () => {
    const { fake, result } = setup();
    result.current.echoCommand(LINE, receipt('r1'));

    result.current.echoCommand(LINE, receipt('r1'));

    expect(fake.writes.at(-1)).toEqual({ data: formatEchoedCommand(LINE), args: 1 });
    expect(addMarker).toHaveBeenCalledTimes(1);
    expect(handles[0]?.show).not.toHaveBeenCalled();
    expect(handles[0]?.remove).not.toHaveBeenCalled();
  });

  it('writes a repeated delivery of a settled id with no handler', () => {
    const { fake, placement, result } = setup();
    result.current.echoCommand(LINE, receipt('r1'));
    result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });
    placement.wrote();

    result.current.echoCommand(LINE, receipt('r1'));

    expect(fake.writes.at(-1)).toEqual({ data: formatEchoedCommand(LINE), args: 1 });
    expect(addMarker).toHaveBeenCalledTimes(1);
  });
});

describe('useShellReplyWriters row markers that arrive late', () => {
  it('draws the link directly on a marker that arrives after the reply settled with a record', () => {
    const { fake, openConnection, result } = setup();
    fake.hold.on = true;
    result.current.echoCommand(LINE, receipt('r1'));
    expect(addMarker).not.toHaveBeenCalled();

    result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });
    expect(addMarker).not.toHaveBeenCalled();

    fake.release();

    expect(addMarker).toHaveBeenCalledTimes(1);
    expect(addMarker).toHaveBeenCalledWith(
      fake.terminal, fake.markers[0], expect.objectContaining({ kind: 'link', name: 'ask-model' }),
    );
    expect(handles[0]?.show).not.toHaveBeenCalled();
    viewOf(0).onOpen();
    expect(openConnection).toHaveBeenCalledWith({ text: 'ask-model', kind: 'acp', recordId: 'rec-1' });
  });

  it('draws nothing and disposes the marker that arrives after the reply settled without a record', () => {
    const { fake, result } = setup();
    fake.hold.on = true;
    result.current.echoCommand(LINE, receipt('r1'));
    result.current.displayReply(LINE, 'Refused', { id: 'r1' });

    fake.release();

    expect(addMarker).not.toHaveBeenCalled();
    expect(fake.markers).toHaveLength(1);
    expect(fake.markers[0]?.dispose).toHaveBeenCalledOnce();
  });

  it('draws against its own terminal after the state was replaced, and leaves the new state empty', () => {
    const { fake, markersRef, terminalRef, result } = setup();
    const later = fakeTerminal();
    fake.hold.on = true;
    result.current.echoCommand(LINE, receipt('r1'));

    markersRef.current = createReplyMarkers();
    terminalRef.current = later.terminal;
    fake.release();

    expect(addMarker).toHaveBeenCalledTimes(1);
    expect(addMarker).toHaveBeenCalledWith(fake.terminal, fake.markers[0], expect.objectContaining({ kind: 'running' }));
    expect(later.markers).toHaveLength(0);
    expect(markersRef.current.entries.size).toBe(0);
    expect(markersRef.current).not.toHaveProperty('written');
    expect(markersRef.current).toEqual({ entries: new Map() });
  });
});

describe('useShellReplyWriters clicks and options', () => {
  it('keeps the role of each outstanding command in its running click, and names no record', () => {
    const { openConnection, result } = setup();
    result.current.echoCommand('ask hello', receipt('r1', 'ask', 'ask-model'));
    result.current.echoCommand('tell hello', receipt('r2', 'tell', 'tell-model'));

    viewOf(0).onOpen();
    viewOf(1).onOpen();

    expect(openConnection).toHaveBeenNthCalledWith(1, {
      text: 'ask-model', kind: 'acp', acpRef: { scope: 'tab', label: 'shell-1', role: 'ask' },
    });
    expect(openConnection).toHaveBeenNthCalledWith(2, {
      text: 'tell-model', kind: 'acp', acpRef: { scope: 'tab', label: 'shell-1', role: 'tell' },
    });
    expect(openConnection.mock.calls[0]?.[0]).not.toHaveProperty('recordId');
    expect(openConnection.mock.calls[1]?.[0]).not.toHaveProperty('recordId');
  });

  it('does nothing on a running click without a label or without openConnection', () => {
    const noLabel = setup({ label: undefined });
    noLabel.result.current.echoCommand(LINE, receipt('r1'));
    expect(() => { viewOf(0).onOpen(); }).not.toThrow();
    expect(noLabel.openConnection).not.toHaveBeenCalled();

    addMarker.mockClear();
    const noOpen = setup({ openConnection: undefined });
    noOpen.result.current.echoCommand(LINE, receipt('r1'));
    expect(() => { viewOf(0).onOpen(); }).not.toThrow();
    noOpen.result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });
    const shown = handles.at(-1)?.show.mock.calls[0]?.[0] as { onOpen: () => void };
    expect(() => { shown.onOpen(); }).not.toThrow();
  });

  it('reads the options current at the click, and keeps its writers identity across a re-render', () => {
    const first = setup();
    const { displayReply, echoCommand } = first.result.current;
    first.result.current.echoCommand(LINE, receipt('r1'));
    insertBlock.mockImplementation(() => true);
    first.result.current.displayReply('help', 'Docs');
    const staleLink = insertBlock.mock.calls[0]?.[3];
    const openLink = vi.fn<(href: string) => void>();
    const openConnection = vi.fn<(row: ShellConnectionRow) => void>();

    first.rerender({ ...first.props, label: 'shell-2', openLink, openConnection });

    expect(first.result.current.displayReply).toBe(displayReply);
    expect(first.result.current.echoCommand).toBe(echoCommand);
    viewOf(0).onOpen();
    expect(openConnection).toHaveBeenCalledWith({
      text: 'ask-model', kind: 'acp', acpRef: { scope: 'tab', label: 'shell-2', role: 'ask' },
    });
    expect(first.openConnection).not.toHaveBeenCalled();
    staleLink?.('https://example.test/doc');
    expect(openLink).toHaveBeenCalledWith('https://example.test/doc');
    expect(first.openLink).not.toHaveBeenCalled();
  });

  it('does nothing when it has no terminal', () => {
    const { markersRef, terminalRef, result } = setup();
    terminalRef.current = null;

    result.current.echoCommand(LINE, receipt('r1'));
    result.current.displayReply(LINE, 'Done', { id: 'r1', record: RECORD });

    expect(addMarker).not.toHaveBeenCalled();
    expect(markersRef.current.entries.size).toBe(0);
    expect(markersRef.current).not.toHaveProperty('written');
  });
});
