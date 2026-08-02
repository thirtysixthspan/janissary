import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  return { client: { send } as unknown as JanusClient, send };
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

  it('labels the fallback button generically when no player is configured', () => {
    const { client } = makeClient();
    const { container } = render(<VideoTab video={makeVideo({ player: '' })} client={client} />);

    fireEvent.error(container.querySelector('video')!);

    expect(screen.getByRole('button', { name: 'Open externally' })).toBeInTheDocument();
  });
});
