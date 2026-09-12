import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfLayout } from './pdf-view-model';
import { SCROLL_STEP, usePdfKeys } from './usePdfKeys';

function setup(layout: PdfLayout, enabled = true) {
  const stage = document.createElement('div');
  Object.defineProperty(stage, 'clientHeight', { value: 500, configurable: true });
  document.body.append(stage);
  const handlers = { pageBy: vi.fn(), zoomBy: vi.fn(), resetZoom: vi.fn() };
  renderHook(() => { usePdfKeys(enabled, layout, { current: stage }, handlers); });
  return { handlers, stage };
}

function press(key: string) {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
}

describe('usePdfKeys in single-page layout', () => {
  it('moves between pages with the arrows and the page keys', () => {
    const { handlers } = setup('single');
    for (const key of ['ArrowUp', 'PageUp']) {
      press(key);
      expect(handlers.pageBy).toHaveBeenLastCalledWith(-1);
    }
    for (const key of ['ArrowDown', 'PageDown']) {
      press(key);
      expect(handlers.pageBy).toHaveBeenLastCalledWith(1);
    }
    expect(handlers.pageBy).toHaveBeenCalledTimes(4);
  });

  it('leaves the scroll position of the stage alone', () => {
    const { stage } = setup('single');
    press('PageDown');
    expect(stage.scrollTop).toBe(0);
  });
});

describe('usePdfKeys in continuous layout', () => {
  it('scrolls by a step with the arrows and by a stage height with the page keys', () => {
    const { handlers, stage } = setup('continuous');

    press('ArrowDown');
    expect(stage.scrollTop).toBe(SCROLL_STEP);
    press('ArrowUp');
    expect(stage.scrollTop).toBe(0);
    press('PageDown');
    expect(stage.scrollTop).toBe(500);

    expect(handlers.pageBy).not.toHaveBeenCalled();
  });
});

describe('usePdfKeys zoom', () => {
  it('resets zoom on Escape in either layout', () => {
    for (const layout of ['single', 'continuous'] as const) {
      const { handlers } = setup(layout);
      press('Escape');
      expect(handlers.resetZoom).toHaveBeenCalledTimes(1);
    }
  });

  it('zooms on the wheel only with the platform chord', () => {
    const { handlers, stage } = setup('single');

    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, cancelable: true }));
    expect(handlers.zoomBy).not.toHaveBeenCalled();

    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, cancelable: true }));
    expect(handlers.zoomBy).toHaveBeenLastCalledWith(1);

    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, metaKey: true, cancelable: true }));
    expect(handlers.zoomBy).toHaveBeenLastCalledWith(-1);
  });
});

// A plugin tab stays mounted while hidden, so a PDF tab that is not the visible one must swallow
// nothing at all.
describe('usePdfKeys while the tab is not on screen', () => {
  it('ignores every key and the zoom chord', () => {
    const { handlers, stage } = setup('continuous', false);

    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Escape']) press(key);
    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, cancelable: true }));

    expect(handlers.pageBy).not.toHaveBeenCalled();
    expect(handlers.resetZoom).not.toHaveBeenCalled();
    expect(handlers.zoomBy).not.toHaveBeenCalled();
    expect(stage.scrollTop).toBe(0);
  });
});
