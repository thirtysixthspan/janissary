import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { useFileNavigatorOpener } from './useFileNavigatorOpener';
import type { JanusClient } from '../ws';
import type { FileOpenerChoice, FileOpenerResolution } from '@shared/protocol';

// Every open and edit travels as the navigator-scoped RPC rather than a command, so nothing lands in
// a transcript or a command history and a busy agent never queues the request. What the hook adds on
// top is the fallback chooser and its keyboard handling — the part that had no test at all.

const CHOICES: FileOpenerChoice[] = [
  { label: 'Open', command: 'open' },
  { label: 'Edit', command: 'edit' },
  { label: 'Open external', command: 'open external' },
];

type Answer = 'no-request' | { ok: true; value: FileOpenerResolution } | { ok: false; error?: string };

const PLAIN_OPEN: Answer = { ok: true, value: { command: 'open', choices: [] } };

function client(answer: Answer = PLAIN_OPEN) {
  const send = vi.fn();
  const request = answer === 'no-request' ? undefined : vi.fn().mockResolvedValue(answer);
  return { client: { send, request } as unknown as JanusClient, send, request };
}

function key(k: string): React.KeyboardEvent {
  return { key: k, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

function hook(answer?: Answer) {
  const socket = client(answer);
  return { ...socket, ...renderHook(() => useFileNavigatorOpener(socket.client, 2)) };
}

describe('useFileNavigatorOpener open', () => {
  it('runs a resolved command straight away without asking twice', async () => {
    const h = hook();

    await act(async () => { h.result.current.open('src/a.txt', false); });

    expect(h.request).toHaveBeenCalledWith({
      method: 'fileNavigatorOpeners', params: { index: 2, relPath: 'src/a.txt', edit: false },
    });
    expect(h.send).toHaveBeenCalledWith({
      method: 'fileNavigatorOpen', params: { index: 2, relPath: 'src/a.txt', command: 'open' },
    });
    expect(h.result.current.pending).toBeNull();
  });

  it('sends edit when the row was edit-activated', async () => {
    const h = hook({ ok: true, value: { command: 'edit', choices: [] } });

    await act(async () => { h.result.current.open('src/a.txt', true); });

    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({ command: 'edit' }),
    }));
  });

  it('shows the chooser when the server named no single command', async () => {
    const h = hook({ ok: true, value: { choices: CHOICES } });

    await act(async () => { h.result.current.open('notes.bin', false); });

    expect(h.result.current.pending).toEqual({ path: 'notes.bin', paths: ['notes.bin'], choices: CHOICES, selected: 0 });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('opens nothing on a refused request', async () => {
    const h = hook({ ok: false, error: 'no navigator' });

    await act(async () => { h.result.current.open('src/a.txt', false); });

    expect(h.send).not.toHaveBeenCalled();
    expect(h.result.current.pending).toBeNull();
  });

  it('opens nothing when the server named no command and no choices', async () => {
    const h = hook({ ok: true, value: { choices: [] } });

    await act(async () => { h.result.current.open('notes', false); });

    expect(h.send).not.toHaveBeenCalled();
    expect(h.result.current.pending).toBeNull();
  });

  // A client with no request support has no chooser to show, so it does the plain open instead of
  // asking a question it cannot get an answer to.
  it('falls back to a plain open on a client with no request', async () => {
    const h = hook('no-request');

    act(() => { h.result.current.open('src/a.txt', false); });

    expect(h.request).toBeUndefined();
    expect(h.send).toHaveBeenCalledWith({
      method: 'fileNavigatorOpen', params: { index: 2, relPath: 'src/a.txt', command: 'open' },
    });
  });
});

describe('useFileNavigatorOpener openWith', () => {
  it('always asks for the chooser, even for a file a registered opener claims', async () => {
    const h = hook({ ok: true, value: { command: 'open', choices: CHOICES } });

    await act(async () => { h.result.current.openWith('notes.md'); });

    expect(h.request).toHaveBeenCalledWith({
      method: 'fileNavigatorOpeners', params: { index: 2, relPath: 'notes.md', edit: false, all: true },
    });
    expect(h.result.current.pending?.choices).toEqual(CHOICES);
  });

  it('keeps the whole selection so an edit choice applies to every selected path', async () => {
    const h = hook({ ok: true, value: { choices: CHOICES } });

    await act(async () => { h.result.current.openWith('a.txt', ['a.txt', 'b.txt']); });

    expect(h.result.current.pending?.paths).toEqual(['a.txt', 'b.txt']);
  });

  it('shows nothing when the server offers no choices', async () => {
    const h = hook({ ok: true, value: { command: 'open', choices: [] } });

    await act(async () => { h.result.current.openWith('notes.md'); });

    expect(h.result.current.pending).toBeNull();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('falls back to a plain open on a client with no request', async () => {
    const h = hook('no-request');

    act(() => { h.result.current.openWith('notes.md'); });

    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ command: 'open' }) }));
  });
});

describe('useFileNavigatorOpener choose', () => {
  const CHOOSER: Answer = { ok: true, value: { choices: CHOICES } };

  async function pendingOn(answer: Answer = CHOOSER) {
    const h = hook(answer);
    await act(async () => { h.result.current.openWith('notes.bin'); });
    return h;
  }

  it('runs the chosen command against the path the chooser was opened for', async () => {
    const h = await pendingOn();

    act(() => { h.result.current.choose(2); });

    expect(h.send).toHaveBeenCalledWith({
      method: 'fileNavigatorOpen', params: { index: 2, relPath: 'notes.bin', command: 'open external' },
    });
    expect(h.result.current.pending).toBeNull();
  });

  // Editing is the one choice that means something about the whole selection rather than the one
  // row, so every selected path is sent.
  it('edits every selected path when edit is chosen', async () => {
    const h = hook({ ok: true, value: { choices: CHOICES } });
    await act(async () => { h.result.current.openWith('a.txt', ['a.txt', 'b.txt']); });

    act(() => { h.result.current.choose(1); });

    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send).toHaveBeenNthCalledWith(1, {
      method: 'fileNavigatorOpen', params: { index: 2, relPath: 'a.txt', command: 'edit' },
    });
    expect(h.send).toHaveBeenNthCalledWith(2, {
      method: 'fileNavigatorOpen', params: { index: 2, relPath: 'b.txt', command: 'edit' },
    });
  });

  it('closes the chooser on an index that names no choice', async () => {
    const h = await pendingOn();

    act(() => { h.result.current.choose(9); });

    expect(h.send).not.toHaveBeenCalled();
    expect(h.result.current.pending).toBeNull();
  });

  it('does nothing when no chooser is up', () => {
    const h = hook();

    act(() => { h.result.current.choose(0); });

    expect(h.send).not.toHaveBeenCalled();
  });
});

describe('useFileNavigatorOpener onKeyDown', () => {
  async function pendingOn() {
    const h = hook({ ok: true, value: { choices: CHOICES } });
    await act(async () => { h.result.current.openWith('notes.bin'); });
    return h;
  }

  it('moves the selection and never past either end', async () => {
    const h = await pendingOn();
    const up = key('ArrowUp');

    act(() => { h.result.current.onKeyDown(up); });
    expect(h.result.current.pending?.selected).toBe(0);
    expect(up.preventDefault).toHaveBeenCalled();

    act(() => { h.result.current.onKeyDown(key('ArrowDown')); });
    act(() => { h.result.current.onKeyDown(key('ArrowDown')); });
    act(() => { h.result.current.onKeyDown(key('ArrowDown')); });
    expect(h.result.current.pending?.selected).toBe(2);
  });

  it('runs the selected choice on Enter and closes the chooser', async () => {
    const h = await pendingOn();

    act(() => { h.result.current.onKeyDown(key('ArrowDown')); });
    act(() => { h.result.current.onKeyDown(key('Enter')); });

    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({ command: 'edit' }),
    }));
    expect(h.result.current.pending).toBeNull();
  });

  it('closes the chooser on Escape without opening anything', async () => {
    const h = await pendingOn();

    act(() => { h.result.current.onKeyDown(key('Escape')); });

    expect(h.result.current.pending).toBeNull();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('swallows the keys it handles and any other key while the chooser is up', async () => {
    const h = await pendingOn();

    expect(h.result.current.onKeyDown(key('a'))).toBe(true);
    expect(h.result.current.pending).not.toBeNull();
  });

  // With no chooser up the key belongs to whatever is underneath, so the hook must not claim it.
  it('claims nothing when no chooser is up', () => {
    const h = hook();

    expect(h.result.current.onKeyDown(key('ArrowDown'))).toBe(false);
    expect(h.result.current.onKeyDown(key('Enter'))).toBe(false);
  });
});
