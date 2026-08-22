import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SEEK_STEP_SECONDS, audioTransport, useAudioKeys } from './useAudioKeys';

function makePlayer(currentTime = 100, duration = 300) {
  const player = {
    currentTime,
    duration,
    paused: true,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  };
  return { player, ref: { current: player as unknown as HTMLAudioElement } };
}

function bind(currentTime = 100, active = true) {
  const { player, ref } = makePlayer(currentTime);
  const previous = vi.fn();
  const next = vi.fn();
  const transport = audioTransport(ref, { previous, next });
  renderHook(() => { useAudioKeys(active, transport); });
  return { player, previous, next };
}

function press(key: string, shiftKey = false) {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, cancelable: true }));
}

describe('useAudioKeys', () => {
  it('toggles play and pause on Space', () => {
    const { player } = bind();
    press(' ');
    expect(player.play).toHaveBeenCalledOnce();
    player.paused = false;
    press(' ');
    expect(player.pause).toHaveBeenCalledOnce();
  });

  it('seeks by ten seconds each way with the plain arrows', () => {
    const { player } = bind();
    press('ArrowRight');
    expect(player.currentTime).toBe(100 + SEEK_STEP_SECONDS);
    press('ArrowLeft');
    expect(player.currentTime).toBe(100);
  });

  it('clamps a backward seek at the start of the track instead of changing track', () => {
    const { player, previous } = bind(4);
    press('ArrowLeft');
    expect(player.currentTime).toBe(0);
    expect(previous).not.toHaveBeenCalled();
  });

  it('clamps a forward seek at the end of the track instead of changing track', () => {
    const { player, next } = bind(297);
    press('ArrowRight');
    expect(player.currentTime).toBe(300);
    expect(next).not.toHaveBeenCalled();
  });

  it('moves between tracks on the shifted arrows', () => {
    const { player, previous, next } = bind();
    press('ArrowLeft', true);
    press('ArrowRight', true);
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(player.currentTime).toBe(100);
  });

  // A plugin tab stays mounted while hidden, so a hidden audio tab must not swallow these keys.
  it('answers no key at all while the host reports the tab hidden', () => {
    const { player, previous, next } = bind(100, false);
    for (const key of [' ', 'ArrowLeft', 'ArrowRight']) { press(key); press(key, true); }
    expect(player.play).not.toHaveBeenCalled();
    expect(player.currentTime).toBe(100);
    expect(previous).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('audioTransport', () => {
  it('does nothing at all before a player has mounted', () => {
    const previous = vi.fn();
    const transport = audioTransport({ current: null }, { previous, next: vi.fn() });
    expect(() => { transport.toggle(); transport.seekForward(); }).not.toThrow();
  });

  it('treats a track of unknown duration as having nowhere to seek forward to', () => {
    const { ref, player } = makePlayer(0, NaN);
    audioTransport(ref, { previous: vi.fn(), next: vi.fn() }).seekForward();
    expect(player.currentTime).toBe(0);
  });
});
