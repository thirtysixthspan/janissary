import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { VideoView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { VideoTab } from './VideoTab';

function makeVideo(overrides: Partial<VideoView> = {}): VideoView {
  return {
    name: 'clip.mp4',
    path: '/home/user/clip.mp4',
    size: '12 MB',
    url: '/open/1',
    player: 'QuickTime Player',
    ...overrides,
  };
}

function makeClient() {
  const send = vi.fn();
  const request = vi.fn(async () => ({ name: 'clip.shot-1.png' }));
  return { client: { send, request } as unknown as JanusClient, send, request };
}

describe('VideoTab', () => {
  it('renders the metadata header and a player pointing at the tokenized ref', () => {
    const { client } = makeClient();
    const { container } = render(<VideoTab video={makeVideo()} client={client} />);

    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(screen.getByText('12 MB')).toBeInTheDocument();
    expect(screen.getByText('/home/user/clip.mp4')).toBeInTheDocument();

    const player = container.querySelector('video')!;
    expect(player).toHaveAttribute('controls');
    expect(player.getAttribute('src')).toBe('/open/1?token=');
  });

  it('places Split in the right-side metadata actions', () => {
    const { client } = makeClient();
    const onSplit = vi.fn();
    const { container } = render(<VideoTab video={makeVideo()} client={client} onSplit={onSplit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(onSplit).toHaveBeenCalledOnce();
    expect(container.querySelector(':scope .image-actions .tab-split')).not.toBeNull();
  });

  it('swaps the player for the unplayable message and a named button on a decode error', () => {
    const { client } = makeClient();
    const { container } = render(<VideoTab video={makeVideo()} client={client} />);

    fireEvent.error(container.querySelector('video')!);

    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('This video cannot be played in the app.')).toBeInTheDocument();
    expect(container.querySelector('.video-unplayable-path')).toHaveTextContent('/home/user/clip.mp4');
    expect(screen.getByRole('button', { name: 'Open in QuickTime Player' })).toBeInTheDocument();
  });

  it('issues the external-open command when the fallback button is clicked', () => {
    const { client, send } = makeClient();
    const { container } = render(<VideoTab video={makeVideo()} client={client} />);

    fireEvent.error(container.querySelector('video')!);
    fireEvent.click(screen.getByRole('button', { name: 'Open in QuickTime Player' }));

    expect(send).toHaveBeenCalledWith({
      method: 'command',
      params: { text: 'open external /home/user/clip.mp4' },
    });
  });

  it('offers Capture frame beside Split while the player is showing', () => {
    const { client } = makeClient();
    const { container } = render(<VideoTab video={makeVideo()} client={client} onSplit={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Capture frame' })).toBeInTheDocument();
    expect(container.querySelector(':scope .image-actions .tab-split')).not.toBeNull();
  });

  it('drops Capture frame in the unplayable state, where there is no frame to capture', () => {
    const { client } = makeClient();
    const { container } = render(<VideoTab video={makeVideo()} client={client} />);

    fireEvent.error(container.querySelector('video')!);

    expect(screen.queryByRole('button', { name: 'Capture frame' })).not.toBeInTheDocument();
  });

  it('captures a frame and shows the name the server saved it under', async () => {
    const { client, request } = makeClient();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const { container } = render(<VideoTab video={makeVideo()} client={client} />);
    Object.defineProperties(container.querySelector('video')!, {
      videoWidth: { value: 640, configurable: true },
      videoHeight: { value: 480, configurable: true },
    });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Capture frame' })); });

    expect(request).toHaveBeenCalledWith({
      method: 'captureVideoFrame',
      params: { url: '/open/1', dataUrl: 'data:image/png;base64,AAAA' },
    });
    expect(screen.getByText('Saved clip.shot-1.png')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('labels the fallback button generically when no player is configured', () => {
    const { client } = makeClient();
    const { container } = render(<VideoTab video={makeVideo({ player: '' })} client={client} />);

    fireEvent.error(container.querySelector('video')!);

    expect(screen.getByRole('button', { name: 'Open externally' })).toBeInTheDocument();
  });
});
