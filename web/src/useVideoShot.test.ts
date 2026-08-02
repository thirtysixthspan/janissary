import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { VideoView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { useVideoShot } from './useVideoShot';

const DATA_URL = 'data:image/png;base64,AAAA';

const video: VideoView = {
  name: 'clip.mp4', path: '/a/clip.mp4', size: '1 MB', url: '/open/1', player: 'QuickTime Player',
};

// jsdom implements no canvas backend, so the 2D context and the PNG encode are stubbed; what these
// tests pin is the *arguments* the hook draws with and the payload it sends, not real encoding.
let drawImage: ReturnType<typeof vi.fn>;
let toDataURL: ReturnType<typeof vi.fn<(type?: string) => string>>;

beforeEach(() => {
  drawImage = vi.fn();
  toDataURL = vi.fn<(type?: string) => string>(() => DATA_URL);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ({ drawImage }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation((type?: string) => toDataURL(type));
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function makeVideoElement(width: number, height: number) {
  const element = document.createElement('video');
  Object.defineProperties(element, {
    videoWidth: { value: width, configurable: true },
    videoHeight: { value: height, configurable: true },
  });
  return element;
}

function setup(element: HTMLVideoElement | null, request = vi.fn(async () => ({ name: 'clip.shot-1.png' }))) {
  const client = { request } as unknown as JanusClient;
  const ref = { current: element };
  const { result } = renderHook(() => useVideoShot(ref, video, client));
  return { result, request };
}

describe('useVideoShot', () => {
  it('captures at the video\'s intrinsic size, not its layout size', async () => {
    const element = makeVideoElement(1920, 1080);
    element.style.width = '320px';
    const { result } = setup(element);

    await act(async () => { result.current.capture(); });

    expect(drawImage).toHaveBeenCalledWith(element, 0, 0, 1920, 1080);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('sends the canvas payload with the tab\'s own ref and no path', async () => {
    const { result, request } = setup(makeVideoElement(640, 480));

    await act(async () => { result.current.capture(); });

    expect(request).toHaveBeenCalledWith({
      method: 'captureVideoFrame',
      params: { url: '/open/1', dataUrl: DATA_URL },
    });
  });

  it('does nothing when no frame has decoded yet', async () => {
    const { result, request } = setup(makeVideoElement(0, 0));

    await act(async () => { result.current.capture(); });

    expect(request).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('does nothing when there is no video element', async () => {
    const { result, request } = setup(null);

    await act(async () => { result.current.capture(); });

    expect(request).not.toHaveBeenCalled();
  });

  it('exposes the saved name and clears it after the confirmation window', async () => {
    vi.useFakeTimers();
    const { result } = setup(makeVideoElement(640, 480));

    await act(async () => { result.current.capture(); });
    expect(result.current.saved).toBe('clip.shot-1.png');

    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.saved).toBeNull();
  });

  it('clears the busy flag when the request fails, and reports nothing saved', async () => {
    const request = vi.fn(async () => { throw new Error('write failed'); });
    const { result } = setup(makeVideoElement(640, 480), request as never);

    await act(async () => { result.current.capture(); });

    expect(result.current.busy).toBe(false);
    expect(result.current.saved).toBeNull();
  });
});
