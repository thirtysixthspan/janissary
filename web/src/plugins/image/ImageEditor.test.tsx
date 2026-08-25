import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImagePayload } from '@shared/plugins/image/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ImageTab } from './ImageTab';

const DATA_URL = 'data:image/png;base64,AAAA';
const SOURCE = { width: 400, height: 300 };
type IntentSpy = ReturnType<typeof vi.fn<(name: string, payload: unknown) => Promise<unknown>>>;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ({
      drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), setTransform: vi.fn(),
    }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => DATA_URL);
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function makeImage(): ImagePayload {
  return {
    name: 'photo.png', path: '/home/user/photo.png', size: '1.2 MB', url: '/open/1', mode: 'edit',
  };
}

function makeCapabilities(options: {
  active?: boolean;
  intent?: IntentSpy;
  registerDirtyHandle?: TabPluginClientCapabilities['registerDirtyHandle'];
} = {}): TabPluginClientCapabilities {
  const intent = options.intent ?? vi.fn(async () => ({ name: 'photo.png' }));
  return {
    resourceUrl: (reference) => `${reference}?token=`,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    splitAction: null,
    active: options.active ?? true,
    dock: null,
    close: vi.fn(),
    registerDirtyHandle: options.registerDirtyHandle,
    reportFailure: vi.fn(),
  };
}

// The canvas draws from a hidden `<img>`; jsdom never loads one, so the test supplies the intrinsic
// dimensions the browser would have and fires the load itself.
function renderEditor(capabilities = makeCapabilities()) {
  const rendered = render(<ImageTab payload={makeImage()} capabilities={capabilities} />);
  const source = rendered.container.querySelector<HTMLImageElement>(':scope .image-edit-source')!;
  Object.defineProperties(source, {
    naturalWidth: { value: SOURCE.width, configurable: true },
    naturalHeight: { value: SOURCE.height, configurable: true },
  });
  act(() => { fireEvent.load(source); });
  return { ...rendered, capabilities };
}

function fireChord(key: string, shiftKey = false) {
  let event!: KeyboardEvent;
  act(() => {
    event = new KeyboardEvent('keydown', { key, metaKey: true, shiftKey, bubbles: true, cancelable: true });
    globalThis.dispatchEvent(event);
  });
  return event;
}

// One `fireEvent` per step rather than three inside a single `act`: the move handler has to see the
// state the press established, which only exists after React has flushed that render.
function dragOverlay(overlay: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
  fireEvent.pointerDown(overlay, { button: 0, clientX: from.x, clientY: from.y });
  fireEvent.pointerMove(overlay, { clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(overlay, { clientX: to.x, clientY: to.y });
}

describe('ImageEditor toolbar', () => {
  it('offers all five geometry operations', () => {
    renderEditor();
    for (const label of ['Crop', 'Rotate left', 'Rotate right', 'Flip horizontal', 'Flip vertical']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('does not offer resize', () => {
    renderEditor();
    expect(screen.queryByRole('button', { name: 'Resize' })).not.toBeInTheDocument();
  });

  it('starts at the source dimensions and updates the readout as operations apply', () => {
    renderEditor();
    expect(screen.getByText('400 × 300')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    expect(screen.getByText('300 × 400')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Flip horizontal' }));
    expect(screen.getByText('300 × 400')).toBeInTheDocument();
  });

  it('undo and redo step back and forward through the list', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    expect(screen.getByText('300 × 400')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('400 × 300')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByText('300 × 400')).toBeInTheDocument();
  });
});

describe('ImageEditor undo chords', () => {
  it('Cmd+Z steps back and Cmd+Shift+Z steps forward', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    expect(fireChord('z').defaultPrevented).toBe(true);
    expect(screen.getByText('400 × 300')).toBeInTheDocument();

    fireChord('z', true);
    expect(screen.getByText('300 × 400')).toBeInTheDocument();
  });

  // A plugin tab stays mounted while hidden, so the chords have to consult the host's `active` flag.
  it('does not fire while the host reports the tab hidden', () => {
    renderEditor(makeCapabilities({ active: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    expect(fireChord('z').defaultPrevented).toBe(false);
    expect(screen.getByText('300 × 400')).toBeInTheDocument();
  });
});

describe('ImageEditor crop', () => {
  it('starts with the full image selected', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));

    // The toolbar readout also says 400 × 300 while the selection covers the whole image, so the
    // readout this assertion is about has to be looked up inside the overlay.
    const overlay = screen.getByTestId('crop-overlay');
    const selection = within(overlay).getByText('400 × 300').closest('.image-crop-rect')!;
    expect(selection).toHaveStyle({ left: '0%', top: '0%', width: '100%', height: '100%' });
    expect(screen.getByRole('button', { name: 'Apply crop' })).toBeEnabled();
  });

  it('produces the rectangle the released pointer describes', () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));

    dragOverlay(screen.getByTestId('crop-overlay'), { x: 40, y: 30 }, { x: 140, y: 110 });

    expect(screen.getByText('100 × 80')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));
    expect(screen.getByText('100 × 80')).toBeInTheDocument();
    expect(container.querySelector(':scope .image-crop-overlay')).toBeNull();
  });

  it('clamps a drag that runs past the image edges', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));

    dragOverlay(screen.getByTestId('crop-overlay'), { x: -100, y: -100 }, { x: 900, y: 900 });

    fireEvent.click(screen.getByRole('button', { name: 'Apply crop' }));
    expect(screen.getByText('400 × 300')).toBeInTheDocument();
  });

  it('cancelling a gesture leaves the operation list alone', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
    dragOverlay(screen.getByTestId('crop-overlay'), { x: 0, y: 0 }, { x: 50, y: 50 });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel crop' }));

    expect(screen.getByText('400 × 300')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('ImageEditor saving', () => {
  it('Cmd+S saves the current edits', async () => {
    const intent: IntentSpy = vi.fn(async () => ({ name: 'photo.png' }));
    renderEditor(makeCapabilities({ intent }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    await act(async () => { fireChord('s'); });

    expect(intent).toHaveBeenCalledWith('save-edit', { dataUrl: DATA_URL });
  });

  it('does not consume editor shortcuts while the tab is inactive', () => {
    renderEditor(makeCapabilities({ active: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    expect(fireChord('s').defaultPrevented).toBe(false);
    expect(fireChord('Escape').defaultPrevented).toBe(false);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('sends save-edit with a PNG data URL and confirms with the returned name', async () => {
    const intent: IntentSpy = vi.fn(async () => ({ name: 'photo.png' }));
    renderEditor(makeCapabilities({ intent }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });

    expect(intent).toHaveBeenCalledWith('save-edit', { dataUrl: DATA_URL });
    expect(screen.getByText('Saved photo.png')).toBeInTheDocument();
  });

  it('clears the confirmation after the window and leaves the edits live', async () => {
    vi.useFakeTimers();
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(screen.getByText('Saved photo.png')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(4000); });

    expect(screen.queryByText(/^Saved /u)).not.toBeInTheDocument();
    expect(screen.getByText('300 × 400')).toBeInTheDocument();
  });

  it('reports a malformed save result', async () => {
    const intent: IntentSpy = vi.fn(async () => ({ nope: true }));
    const capabilities = makeCapabilities({ intent });
    renderEditor(capabilities);
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });

    expect(capabilities.reportFailure).toHaveBeenCalledWith('invalid save-edit result');
  });

  it('offers Save only while there is unsaved work', async () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('ImageEditor unsaved work', () => {
  it('Escape returns to the viewer without discarding edits', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    expect(fireChord('Escape').defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Edit image' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit image' }));
    expect(screen.getByText('300 × 400')).toBeInTheDocument();
  });

  it('registers a dirty handle with the host and reports the edits through it', async () => {
    const registerDirtyHandle = vi.fn();
    renderEditor(makeCapabilities({ registerDirtyHandle }));
    await waitFor(() => { expect(registerDirtyHandle).toHaveBeenCalled(); });
    const clean = registerDirtyHandle.mock.calls.at(-1)![0];
    expect(clean.isDirty()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    await waitFor(() => {
      expect(registerDirtyHandle.mock.calls.at(-1)![0]?.isDirty()).toBe(true);
    });
  });

  // Leaving edit mode never discards: the work stays live behind the viewer and the tab stays dirty,
  // so the only place it can be lost is a close, which the host's dialog guards.
  it('keeps unsaved edits and the dirty handle across Done and back into Edit', async () => {
    const registerDirtyHandle = vi.fn();
    renderEditor(makeCapabilities({ registerDirtyHandle }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(registerDirtyHandle.mock.calls.at(-1)![0]?.isDirty()).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit image' }));
    expect(screen.getByText('300 × 400')).toBeInTheDocument();
  });

  it('drops the handle when the tab unmounts', async () => {
    const registerDirtyHandle = vi.fn();
    const { unmount } = renderEditor(makeCapabilities({ registerDirtyHandle }));
    await waitFor(() => { expect(registerDirtyHandle).toHaveBeenCalled(); });

    unmount();

    expect(registerDirtyHandle).toHaveBeenLastCalledWith(null);
  });

  it('saving through the host handle clears the dirty state', async () => {
    const registerDirtyHandle = vi.fn();
    renderEditor(makeCapabilities({ registerDirtyHandle }));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    await waitFor(() => {
      expect(registerDirtyHandle.mock.calls.at(-1)![0]?.isDirty()).toBe(true);
    });

    const handle = registerDirtyHandle.mock.calls.at(-1)![0];
    await act(async () => { await handle.save(); });

    await waitFor(() => {
      expect(registerDirtyHandle.mock.calls.at(-1)![0]?.isDirty()).toBe(false);
    });
  });
});
