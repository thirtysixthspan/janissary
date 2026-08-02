import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabPluginClientCapabilities } from '../../api';
import { useVideoShot } from './use-video-shot';

const DATA_URL = 'data:image/png;base64,AAAA';
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

function setup(element: HTMLVideoElement | null, pluginIntent = vi.fn(async () => ({
  schemaVersion: 1, payload: { name: 'clip.shot-1.png' },
}))) {
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: vi.fn(), pluginIntent, splitAction: null,
  };
  const ref = { current: element };
  const { result } = renderHook(() => useVideoShot(ref, capabilities));
  return { result, pluginIntent };
}

describe('useVideoShot', () => {
  it('captures at the video intrinsic size and sends only the canvas payload', async () => {
    const element = makeVideoElement(1920, 1080);
    element.style.width = '320px';
    const { result, pluginIntent } = setup(element);

    await act(async () => { result.current.capture(); });

    expect(drawImage).toHaveBeenCalledWith(element, 0, 0, 1920, 1080);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
    expect(pluginIntent).toHaveBeenCalledWith('capture-frame', { dataUrl: DATA_URL });
  });

  it('does nothing before a frame has decoded or when no element exists', async () => {
    const first = setup(makeVideoElement(0, 0));
    const second = setup(null);

    await act(async () => { first.result.current.capture(); second.result.current.capture(); });

    expect(first.pluginIntent).not.toHaveBeenCalled();
    expect(second.pluginIntent).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('exposes the saved name and clears it after the confirmation window', async () => {
    vi.useFakeTimers();
    const { result } = setup(makeVideoElement(640, 480));

    await act(async () => { result.current.capture(); });
    expect(result.current.saved).toBe('clip.shot-1.png');

    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.saved).toBeNull();
  });

  it('stays busy until the capture intent settles', async () => {
    vi.useFakeTimers();
    const pluginIntent = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { schemaVersion: 1, payload: { name: 'clip.shot-1.png' } };
    });
    const { result } = setup(makeVideoElement(640, 480), pluginIntent);

    act(() => { result.current.capture(); });
    expect(result.current.busy).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.busy).toBe(false);
  });

  it('clears the busy flag when the request fails', async () => {
    const pluginIntent = vi.fn(async () => { throw new Error('write failed'); });
    const { result } = setup(makeVideoElement(640, 480), pluginIntent);

    await act(async () => { result.current.capture(); });

    expect(result.current.busy).toBe(false);
    expect(result.current.saved).toBeNull();
  });
});
