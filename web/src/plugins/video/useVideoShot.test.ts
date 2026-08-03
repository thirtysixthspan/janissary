import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabPluginClientCapabilities } from '../api';
import { useVideoShot } from './useVideoShot';

const DATA_URL = 'data:image/png;base64,AAAA';
type IntentSpy = ReturnType<typeof vi.fn<(name: string, payload: unknown) => Promise<unknown>>>;
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

function setup(
  element: HTMLVideoElement | null,
  intent: IntentSpy = vi.fn(async () => ({ name: 'clip.shot-1.png' })),
) {
  const capabilities = {
    resourceUrl: vi.fn(),
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    splitAction: null,
    active: true,
    reportFailure: vi.fn(),
  } as TabPluginClientCapabilities;
  const { result } = renderHook(() => useVideoShot({ current: element }, capabilities));
  return { capabilities, intent, result };
}

describe('useVideoShot', () => {
  it('captures at intrinsic dimensions and sends only the PNG intent payload', async () => {
    const element = makeVideoElement(1920, 1080);
    element.style.width = '320px';
    const { intent, result } = setup(element);
    await act(async () => { result.current.capture(); });
    expect(drawImage).toHaveBeenCalledWith(element, 0, 0, 1920, 1080);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
    expect(intent).toHaveBeenCalledWith('capture-frame', { dataUrl: DATA_URL });
  });

  it('does nothing without a decoded frame or element', async () => {
    const first = setup(makeVideoElement(0, 0));
    const second = setup(null);
    await act(async () => { first.result.current.capture(); second.result.current.capture(); });
    expect(first.intent).not.toHaveBeenCalled();
    expect(second.intent).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('shows the saved name for the confirmation window', async () => {
    vi.useFakeTimers();
    const { result } = setup(makeVideoElement(640, 480));
    await act(async () => { result.current.capture(); });
    expect(result.current.saved).toBe('clip.shot-1.png');
    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.saved).toBeNull();
  });

  it('clears busy on rejection without reporting a saved name', async () => {
    const intent = vi.fn(async () => { throw new Error('write failed'); });
    const { result } = setup(makeVideoElement(640, 480), intent);
    await act(async () => { result.current.capture(); });
    expect(result.current.busy).toBe(false);
    expect(result.current.saved).toBeNull();
  });

  it('reports a malformed server result', async () => {
    const intent = vi.fn(async () => ({ nope: true }));
    const { capabilities, result } = setup(makeVideoElement(640, 480), intent);
    await act(async () => { result.current.capture(); });
    expect(capabilities.reportFailure).toHaveBeenCalledWith('invalid capture-frame result');
  });

  // A browser that refuses a 2d context has nothing to draw the frame onto. That is a limitation of
  // the page, not a broken plugin, so the capture stops silently rather than crossing the failure
  // boundary and disabling video for the session.
  it('gives up quietly when the canvas has no 2d context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { capabilities, intent, result } = setup(makeVideoElement(640, 480));
    await act(async () => { result.current.capture(); });
    expect(intent).not.toHaveBeenCalled();
    expect(capabilities.reportFailure).not.toHaveBeenCalled();
  });

  it('restarts the confirmation window when a second capture lands inside the first', async () => {
    vi.useFakeTimers();
    const names = ['clip.shot-1.png', 'clip.shot-2.png'];
    const intent = vi.fn(async () => ({ name: names.shift() }));
    const { result } = setup(makeVideoElement(640, 480), intent);

    await act(async () => { result.current.capture(); });
    act(() => { vi.advanceTimersByTime(3000); });
    await act(async () => { result.current.capture(); });
    expect(result.current.saved).toBe('clip.shot-2.png');

    // The first capture's timer would have fired here had the second not replaced it.
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.saved).toBe('clip.shot-2.png');
    act(() => { vi.advanceTimersByTime(2500); });
    expect(result.current.saved).toBeNull();
  });
});
