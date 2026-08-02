import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabPluginClientCapabilities } from '../../api';
import type { VideoPayload } from '../shared';
import { VideoTab } from './VideoTab';

function makeVideo(overrides: Partial<VideoPayload> = {}): VideoPayload {
  return {
    name: 'clip.mp4',
    path: '/home/user/clip.mp4',
    size: '12 MB',
    url: '/open/1',
    player: 'QuickTime Player',
    ...overrides,
  };
}

function makeCapabilities() {
  const pluginIntent = vi.fn(async (intent: string) => ({
    schemaVersion: 1,
    payload: intent === 'capture-frame' ? { name: 'clip.shot-1.png' } : { opened: true },
  }));
  const split = vi.fn();
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (ref) => `${ref}?token=`,
    pluginIntent,
    splitAction: <button type="button" onClick={split}>Split</button>,
  };
  return { capabilities, pluginIntent, split };
}

describe('VideoTab', () => {
  it('renders metadata and a player pointing at the capability-provided URL', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<VideoTab video={makeVideo()} capabilities={capabilities} />);

    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(screen.getByText('12 MB')).toBeInTheDocument();
    expect(screen.getByText('/home/user/clip.mp4')).toBeInTheDocument();
    expect(container.querySelector('video')).toHaveAttribute('src', '/open/1?token=');
  });

  it('places the host split action in the right-side metadata actions', () => {
    const { capabilities, split } = makeCapabilities();
    const { container } = render(<VideoTab video={makeVideo()} capabilities={capabilities} />);

    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(split).toHaveBeenCalledOnce();
    expect(container.querySelector('.image-actions')).toContainElement(screen.getByRole('button', { name: 'Split' }));
  });

  it('swaps the player for a fallback after a decode error', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<VideoTab video={makeVideo()} capabilities={capabilities} />);

    fireEvent.error(container.querySelector('video')!);

    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('This video cannot be played in the app.')).toBeInTheDocument();
    expect(container.querySelector('.video-unplayable-path')).toHaveTextContent('/home/user/clip.mp4');
    expect(screen.getByRole('button', { name: 'Open in QuickTime Player' })).toBeInTheDocument();
  });

  it('uses the external-open plugin intent for the fallback button', () => {
    const { capabilities, pluginIntent } = makeCapabilities();
    const { container } = render(<VideoTab video={makeVideo()} capabilities={capabilities} />);

    fireEvent.error(container.querySelector('video')!);
    fireEvent.click(screen.getByRole('button', { name: 'Open in QuickTime Player' }));

    expect(pluginIntent).toHaveBeenCalledWith('open-external', {});
  });

  it('offers frame capture while the player is showing and removes it after failure', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<VideoTab video={makeVideo()} capabilities={capabilities} />);

    expect(screen.getByRole('button', { name: 'Capture frame' })).toBeInTheDocument();
    fireEvent.error(container.querySelector('video')!);
    expect(screen.queryByRole('button', { name: 'Capture frame' })).not.toBeInTheDocument();
  });

  it('captures a frame and shows the name returned by the plugin', async () => {
    const { capabilities, pluginIntent } = makeCapabilities();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const { container } = render(<VideoTab video={makeVideo()} capabilities={capabilities} />);
    Object.defineProperties(container.querySelector('video')!, {
      videoWidth: { value: 640, configurable: true },
      videoHeight: { value: 480, configurable: true },
    });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Capture frame' })); });

    expect(pluginIntent).toHaveBeenCalledWith('capture-frame', { dataUrl: 'data:image/png;base64,AAAA' });
    expect(screen.getByText('Saved clip.shot-1.png')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('labels the fallback generically when no player is configured', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<VideoTab video={makeVideo({ player: '' })} capabilities={capabilities} />);

    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByRole('button', { name: 'Open externally' })).toBeInTheDocument();
  });
});
