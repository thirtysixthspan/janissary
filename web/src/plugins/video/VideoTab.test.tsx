import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VideoPayload } from '@shared/plugins/video/shared';
import type { TabPluginClientCapabilities } from '../api';
import { VideoTab } from './VideoTab';

function makeVideo(overrides: Partial<VideoPayload> = {}): VideoPayload {
  return {
    name: 'clip.mp4', path: '/home/user/clip.mp4', size: '12 MB',
    url: '/open/1', player: 'QuickTime Player', ...overrides,
  };
}

function makeCapabilities(onSplit?: () => void) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(
    async () => ({ name: 'clip.shot-1.png' }),
  );
  const reportFailure = vi.fn();
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => `${reference}?token=`,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    splitAction: onSplit ? <button type="button" className="tab-split" onClick={onSplit}>Split</button> : null,
    active: true,
    reportFailure,
  };
  return { capabilities, intent, reportFailure };
}

describe('VideoTab', () => {
  it('renders metadata and a native player using the resource capability', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<VideoTab payload={makeVideo()} capabilities={capabilities} />);
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(screen.getByText('12 MB')).toBeInTheDocument();
    expect(screen.getByText('/home/user/clip.mp4')).toBeInTheDocument();
    expect(container.querySelector('video')).toHaveAttribute('src', '/open/1?token=');
    expect(container.querySelector('video')).toHaveAttribute('controls');
  });

  it('renders the supplied split action with the metadata actions', () => {
    const onSplit = vi.fn();
    const { capabilities } = makeCapabilities(onSplit);
    const { container } = render(<VideoTab payload={makeVideo()} capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(onSplit).toHaveBeenCalledOnce();
    expect(container.querySelector(':scope .image-actions .tab-split')).not.toBeNull();
  });

  it('shows a named external fallback after a decode error', async () => {
    const { capabilities, intent } = makeCapabilities();
    const { container } = render(<VideoTab payload={makeVideo()} capabilities={capabilities} />);
    fireEvent.error(container.querySelector('video')!);
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('This video cannot be played in the app.')).toBeInTheDocument();
    expect(container.querySelector('.video-unplayable-path')).toHaveTextContent('/home/user/clip.mp4');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open in QuickTime Player' })); });
    expect(intent).toHaveBeenCalledWith('open-external', {});
  });

  it('uses a generic fallback label when no player is configured', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(
      <VideoTab payload={makeVideo({ player: '' })} capabilities={capabilities} />,
    );
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByRole('button', { name: 'Open externally' })).toBeInTheDocument();
  });

  it('offers capture only while the player is available', () => {
    const { capabilities } = makeCapabilities();
    const { container } = render(<VideoTab payload={makeVideo()} capabilities={capabilities} />);
    expect(screen.getByRole('button', { name: 'Capture frame' })).toBeInTheDocument();
    fireEvent.error(container.querySelector('video')!);
    expect(screen.queryByRole('button', { name: 'Capture frame' })).not.toBeInTheDocument();
  });

  it('captures a frame and renders the server-selected name', async () => {
    const { capabilities, intent } = makeCapabilities();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const { container } = render(<VideoTab payload={makeVideo()} capabilities={capabilities} />);
    Object.defineProperties(container.querySelector('video')!, {
      videoWidth: { value: 640, configurable: true },
      videoHeight: { value: 480, configurable: true },
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Capture frame' })); });
    expect(intent).toHaveBeenCalledWith('capture-frame', { dataUrl: 'data:image/png;base64,AAAA' });
    expect(screen.getByText('Saved clip.shot-1.png')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
