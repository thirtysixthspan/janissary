import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPayload } from '@shared/plugins/audio/shared';
import type { TabPluginClientCapabilities } from '../api';
import { AudioTab } from './AudioTab';

function makePlaylist(names: string[], current: number | null = 0): AudioPayload {
  return {
    tracks: names.map((name) => ({ name, path: `/music/${name}`, url: `/open/${name}` })),
    current,
    size: current === null ? '' : '4.2 MB',
  };
}

function makeCapabilities(overrides: Partial<TabPluginClientCapabilities> = {}) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => `${reference}?token=`,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    splitAction: null,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
    ...overrides,
  };
  return { capabilities, intent };
}

// jsdom implements no media pipeline, so `play()` is stubbed: a new track starts on its own.
let play: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn(async () => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as unknown as () => Promise<void>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AudioTab', () => {
  it('renders the current track\'s metadata above a native player', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(
      <AudioTab payload={makePlaylist(['a.mp3', 'b.mp3'], 1)} capabilities={capabilities} />,
    );
    expect(screen.getByText('4.2 MB')).toBeInTheDocument();
    expect(screen.getByText('/music/b.mp3')).toBeInTheDocument();
    expect(container.querySelector('audio')).toHaveAttribute('src', '/open/b.mp3?token=');
    expect(container.querySelector('audio')).toHaveAttribute('controls');
  });

  it('renders every queued entry with the playing one marked', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(
      <AudioTab payload={makePlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 1)} capabilities={capabilities} />,
    );
    expect(container.querySelectorAll('.audio-track')).toHaveLength(3);
    expect(container.querySelectorAll('.audio-track-current')).toHaveLength(1);
    expect(container.querySelector('.audio-track-current')).toHaveTextContent('b.mp3');
  });

  it('sends select-track when a playlist row is clicked', async () => {
    const { capabilities, intent } = makeCapabilities();
    render(<AudioTab payload={makePlaylist(['a.mp3', 'b.mp3'])} capabilities={capabilities} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'b.mp3' })); });
    expect(intent).toHaveBeenCalledWith('select-track', { path: '/music/b.mp3' });
  });

  it('sends remove-track from a row\'s remove control', async () => {
    const { capabilities, intent } = makeCapabilities();
    render(<AudioTab payload={makePlaylist(['a.mp3', 'b.mp3'])} capabilities={capabilities} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove a.mp3' })); });
    expect(intent).toHaveBeenCalledWith('remove-track', { path: '/music/a.mp3' });
  });

  it('drops an entry the browser cannot decode and says so with the unplayable flag', async () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(
      <AudioTab payload={makePlaylist(['a.mp3', 'b.mp3'])} capabilities={capabilities} />,
    );
    await act(async () => { fireEvent.error(container.querySelector('audio')!); });
    expect(intent).toHaveBeenCalledWith('remove-track', { path: '/music/a.mp3', unplayable: true });
  });

  it('moves to the following entry when a track ends', async () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(
      <AudioTab payload={makePlaylist(['a.mp3', 'b.mp3'])} capabilities={capabilities} />,
    );
    await act(async () => { fireEvent.ended(container.querySelector('audio')!); });
    expect(intent).toHaveBeenCalledWith('select-track', { path: '/music/b.mp3' });
  });

  it('sends nothing when the last entry in the queue ends', async () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(
      <AudioTab payload={makePlaylist(['a.mp3', 'b.mp3'], 1)} capabilities={capabilities} />,
    );
    await act(async () => { fireEvent.ended(container.querySelector('audio')!); });
    expect(intent).not.toHaveBeenCalled();
  });

  it('drives the player from the transport buttons', () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(
      <AudioTab payload={makePlaylist(['a.mp3', 'b.mp3'])} capabilities={capabilities} />,
    );
    const player = container.querySelector('audio')!;
    Object.defineProperty(player, 'duration', { value: 300, configurable: true });
    player.currentTime = 100;

    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(player.currentTime).toBe(110);
    fireEvent.click(screen.getByRole('button', { name: 'Back 10 seconds' }));
    expect(player.currentTime).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Play or pause' }));
    expect(play).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(intent).toHaveBeenCalledWith('select-track', { path: '/music/b.mp3' });
  });

  it('shows its empty state and no player once the queue is emptied', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(
      <AudioTab payload={makePlaylist([], null)} capabilities={capabilities} />,
    );
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('.audio-empty')).toHaveTextContent('No tracks queued');
    expect(container.querySelectorAll('.audio-track')).toHaveLength(0);
  });

  it('starts the current track as soon as a visible tab mounts', () => {
    const { capabilities } = makeCapabilities();
    render(<AudioTab payload={makePlaylist(['a.mp3'])} capabilities={capabilities} />);
    expect(play).toHaveBeenCalledOnce();
  });

  it('does not start a track whose tab is not the visible one', () => {
    const { capabilities } = makeCapabilities({ active: false });
    render(<AudioTab payload={makePlaylist(['a.mp3'])} capabilities={capabilities} />);
    expect(play).not.toHaveBeenCalled();
  });

  it('lays itself out for a sidebar when the host reports the tab docked', () => {
    const { capabilities } = makeCapabilities({ dock: 'left' });
    const { container } = render(
      <AudioTab payload={makePlaylist(['a.mp3'])} capabilities={capabilities} />,
    );
    expect(container.querySelector('.audio-tab-docked')).not.toBeNull();
  });
});
