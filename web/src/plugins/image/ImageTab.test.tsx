import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ImagePayload } from '@shared/plugins/image/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ImageTab } from './ImageTab';

function makeImage(overrides: Partial<ImagePayload> = {}): ImagePayload {
  return {
    name: 'photo.png',
    path: '/home/user/photo.png',
    size: '1.2 MB',
    url: '/open/1',
    ...overrides,
  };
}

function makeCapabilities(
  { active = true, onSplit }: { active?: boolean; onSplit?: () => void } = {},
): TabPluginClientCapabilities {
  return {
    resourceUrl: (reference) => `${reference}?token=`,
    intent: async <Result,>() => ({}) as Result,
    splitAction: onSplit
      ? <button type="button" className="tab-split" onClick={onSplit}>Split</button>
      : null,
    active,
    reportFailure: vi.fn(),
  };
}

function renderTab(options: { active?: boolean; onSplit?: () => void; image?: ImagePayload } = {}) {
  return render(
    <ImageTab payload={options.image ?? makeImage()} capabilities={makeCapabilities(options)} />,
  );
}

function fireKey(key: string) {
  let event!: KeyboardEvent;
  act(() => {
    event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    globalThis.dispatchEvent(event);
  });
  return event;
}

function fireWheel(stage: Element, deltaY: number) {
  let event!: WheelEvent;
  act(() => {
    event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    stage.dispatchEvent(event);
  });
  return event;
}

describe('ImageTab', () => {
  it('renders the image metadata', () => {
    renderTab();
    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('1.2 MB')).toBeInTheDocument();
    expect(screen.getByText('/home/user/photo.png')).toBeInTheDocument();
  });

  it('loads the image through the host-authenticated resource url', () => {
    const { container } = renderTab();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/open/1?token=');
  });

  it('offers the host split action and ignores global keys while its tab is inactive', () => {
    const onSplit = vi.fn();
    renderTab({ active: false, onSplit });
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(onSplit).toHaveBeenCalledOnce();
    expect(fireKey('PageUp').defaultPrevented).toBe(false);
    expect(screen.queryByText('110%')).not.toBeInTheDocument();
  });

  it('places the split action in the right-side metadata actions', () => {
    const { container } = renderTab({ onSplit: () => {} });

    expect(container.querySelector(':scope .image-actions .tab-split')).not.toBeNull();
  });

  it('renders no actions area when the host offers no split action', () => {
    const { container } = renderTab();
    expect(container.querySelector('.image-actions')).toBeNull();
  });

  it('hides the zoom badge at 100%', () => {
    renderTab();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  // --- Zoom: PageUp / PageDown ---

  it('PageUp zooms in and shows the badge', () => {
    renderTab();
    fireKey('PageUp');
    expect(screen.getByText('110%')).toBeInTheDocument();
  });

  it('PageDown zooms out and shows the badge', () => {
    renderTab();
    fireKey('PageDown');
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('PageUp and PageDown call preventDefault', () => {
    renderTab();
    expect(fireKey('PageUp').defaultPrevented).toBe(true);
    expect(fireKey('PageDown').defaultPrevented).toBe(true);
  });

  it('clamps zoom at 800%', () => {
    renderTab();
    act(() => { for (let i = 0; i < 80; i++) globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true })); });
    expect(screen.getByText('800%')).toBeInTheDocument();
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true })); });
    expect(screen.getByText('800%')).toBeInTheDocument();
  });

  it('clamps zoom at 10%', () => {
    renderTab();
    act(() => { for (let i = 0; i < 20; i++) globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true })); });
    expect(screen.getByText('10%')).toBeInTheDocument();
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true })); });
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  // --- Wheel zooms ---

  it('wheel up zooms in', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')!;
    fireWheel(stage, -100);
    expect(screen.getByText('110%')).toBeInTheDocument();
  });

  it('wheel down zooms out', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')!;
    fireWheel(stage, 100);
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  // --- Escape resets ---

  it('Escape resets zoom to 100%, hides badge, and resets scroll', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')! as HTMLElement;
    fireKey('PageUp');
    fireKey('PageUp');
    expect(screen.getByText('120%')).toBeInTheDocument();
    stage.scrollTop = 50;
    stage.scrollLeft = 50;
    const escEvent = fireKey('Escape');
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(escEvent.defaultPrevented).toBe(true);
    expect(stage.scrollTop).toBe(0);
    expect(stage.scrollLeft).toBe(0);
  });

  // --- Arrow keys pan ---

  it('ArrowUp pans the stage up (decreases scrollTop)', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')! as HTMLElement;
    stage.scrollTop = 100;
    const event = fireKey('ArrowUp');
    expect(stage.scrollTop).toBe(70);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ArrowDown pans the stage down (increases scrollTop)', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')! as HTMLElement;
    stage.scrollTop = 0;
    const event = fireKey('ArrowDown');
    expect(stage.scrollTop).toBe(30);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ArrowLeft pans the stage left (decreases scrollLeft)', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')! as HTMLElement;
    stage.scrollLeft = 100;
    const event = fireKey('ArrowLeft');
    expect(stage.scrollLeft).toBe(70);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ArrowRight pans the stage right (increases scrollLeft)', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')! as HTMLElement;
    stage.scrollLeft = 0;
    const event = fireKey('ArrowRight');
    expect(stage.scrollLeft).toBe(30);
    expect(event.defaultPrevented).toBe(true);
  });

  it('arrow keys do not change zoom', () => {
    renderTab();
    fireKey('ArrowUp');
    fireKey('ArrowDown');
    fireKey('ArrowLeft');
    fireKey('ArrowRight');
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  // --- Click-drag pans ---

  it('drag moves scroll in the direction of drag', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')! as HTMLElement;
    stage.scrollLeft = 100;
    stage.scrollTop = 100;

    act(() => { stage.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 200, clientY: 200, bubbles: true, cancelable: true })); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 170, bubbles: true })); });

    expect(stage.scrollLeft).toBe(150);
    expect(stage.scrollTop).toBe(130);
  });

  it('cursor becomes grabbing on mousedown and resets on mouseup', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')! as HTMLElement;

    act(() => { stage.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 0, clientY: 0, bubbles: true, cancelable: true })); });
    expect(stage.style.cursor).toBe('grabbing');

    act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
    expect(stage.style.cursor).toBe('');
  });

  it('non-primary button mousedown does not start drag', () => {
    const { container } = renderTab();
    const stage = container.querySelector('.image-stage')! as HTMLElement;

    act(() => { stage.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: 0, clientY: 0, bubbles: true })); });
    expect(stage.style.cursor).not.toBe('grabbing');
  });

  // --- Orientation on load ---

  it('applies image-landscape when the loaded image is wider than tall', () => {
    const { container } = renderTab();
    const img = container.querySelector('img')!;
    Object.defineProperties(img, {
      naturalWidth: { value: 200, configurable: true },
      naturalHeight: { value: 100, configurable: true },
    });
    fireEvent.load(img);
    expect(img).toHaveClass('image-landscape');
  });

  it('applies image-portrait when the loaded image is taller than wide', () => {
    const { container } = renderTab();
    const img = container.querySelector('img')!;
    Object.defineProperties(img, {
      naturalWidth: { value: 100, configurable: true },
      naturalHeight: { value: 200, configurable: true },
    });
    fireEvent.load(img);
    expect(img).toHaveClass('image-portrait');
  });

  // --- Zoom and pan reset on becoming visible again ---

  // A plugin tab stays mounted while hidden, so switching away and back is a change of
  // `capabilities.active` rather than a remount — and it still returns the view to 100% with no
  // offset, the way switching between image tabs always has.
  it('resets zoom and pan when the tab becomes active again', () => {
    const image = makeImage();
    const { container, rerender } = render(
      <ImageTab payload={image} capabilities={makeCapabilities()} />,
    );
    const stage = container.querySelector('.image-stage')! as HTMLElement;
    fireKey('PageUp');
    fireKey('PageUp');
    stage.scrollTop = 40;
    expect(screen.getByText('120%')).toBeInTheDocument();

    rerender(<ImageTab payload={image} capabilities={makeCapabilities({ active: false })} />);
    rerender(<ImageTab payload={image} capabilities={makeCapabilities()} />);

    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(stage.scrollTop).toBe(0);
  });
});
