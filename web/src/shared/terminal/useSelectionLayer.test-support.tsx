import React, { useCallback, useRef } from 'react';
import { act, render } from '@testing-library/react';
import type { Terminal } from '@xterm/xterm';
import { vi } from 'vitest';
import { useSelectionLayer } from './useSelectionLayer';
import type { SelectionLayerApi } from './useSelectionLayer';

const rect = { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480, toJSON: () => {} } as DOMRect;

type FakeBuffer = { active: { viewportY: number; getLine: (index: number) => { translateToString: (trim: boolean) => string } | null } };

export type FakeTerm = { buffer: FakeBuffer; cols: number; rows: number; focus: ReturnType<typeof vi.fn> };

export function fakeBuffer(lines: string[]): FakeBuffer {
  const padded = [...lines];
  while (padded.length < 24) padded.push('');
  return {
    active: {
      viewportY: 0,
      getLine: (index: number) => (padded[index] === undefined ? null : {
        translateToString: (trim: boolean) => (trim ? padded[index].trimEnd() : padded[index]),
      }),
    },
  };
}

export function Surface({ term, inactive, exited, onApi }: {
  term: FakeTerm; inactive?: boolean; exited?: boolean; onApi?: (api: SelectionLayerApi) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bind = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (node) vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(rect);
  }, []);
  const api = useSelectionLayer({
    containerRef,
    termRef: { current: term as unknown as Terminal },
    inactive, exited,
  });
  const bindProbe = (node: HTMLDivElement | null) => {
    api.probeRef.current = node;
    if (node) vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0, width: 400, height: 20 } as DOMRect);
  };
  onApi?.(api);
  return (
    <div data-testid="container" ref={bind}>
      <div data-testid="inner" />
      <div data-testid="probe">{api.view ? api.text() : ''}</div>
      <div data-testid="grid-probe" ref={bindProbe} />
    </div>
  );
}

export function mountSelectionLayer(termLines: string[], onApi?: (api: SelectionLayerApi) => void, inactive?: boolean, exited?: boolean) {
  const term: FakeTerm = { buffer: fakeBuffer(termLines), cols: 80, rows: 24, focus: vi.fn() };
  const view = render(<Surface term={term} inactive={inactive} exited={exited} onApi={onApi} />);
  return { term, view };
}

export function pointer(type: string, x: number, y: number, shift: boolean): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, { button: { value: 0 }, shiftKey: { value: shift } });
  return event;
}

export function drag(container: HTMLElement, toX: number, toY: number, fromX = 5, fromY = 10): void {
  act(() => {
    container.dispatchEvent(pointer('pointerdown', fromX, fromY, true));
    container.dispatchEvent(pointer('pointermove', toX, toY, true));
    container.dispatchEvent(pointer('pointerup', toX, toY, true));
  });
}
