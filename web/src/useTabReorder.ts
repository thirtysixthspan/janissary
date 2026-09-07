import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import { startDrag } from './drag-resize';

const DRAG_THRESHOLD_PX = 5;

type Point = { x: number; y: number };
type Rect = Point & { centerX: number; centerY: number };
type Drag = {
  from: number;
  // The dragged tab's identity, so the drag can tell whether `from` still means the same tab. The
  // index alone cannot: the list is server-driven and replaced whole.
  label: string;
  to: number;
  origin: Point;
  pointer: Point;
  rects: Rect[];
  cancelled: boolean;
  started: boolean;
};

export type TabDragTransform = Point & { dragged: boolean };

export type CrossStripDrop = {
  zone: string;
  onDrop: (from: number) => void;
};

function measuredTabs(strip: HTMLDivElement): Rect[] {
  return [...strip.querySelectorAll<HTMLElement>(':scope > .tab')].map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  });
}

function allowedRange(tabs: TabView[], from: number): [number, number] {
  const tab = tabs[from];
  if (tab.dock || tab.group === 0) return [0, tabs.length - 1];
  let first = from;
  let last = from;
  while (tabs[first - 1]?.group === tab.group) first--;
  while (tabs[last + 1]?.group === tab.group) last++;
  return [first, last];
}

function nearestSlot(rects: Rect[], pointer: Point, range: [number, number]): number {
  let nearest = range[0];
  let distance = Infinity;
  for (let index = range[0]; index <= range[1]; index++) {
    const rect = rects[index];
    const nextDistance = Math.hypot(pointer.x - rect.centerX, pointer.y - rect.centerY);
    if (nextDistance < distance) {
      nearest = index;
      distance = nextDistance;
    }
  }
  return nearest;
}

// Whether the strip this drag measured is still the strip on screen. The rectangles are captured
// once, at the threshold crossing, while the tab list is server-driven and replaced whole — a tab
// arriving or leaving mid-gesture (an agent opening one, a schedule firing, a monitor's reporting
// tab) leaves the two describing different strips. Indexing the frozen rectangles with a slot
// derived from the live list then reads past their end, and with no error boundary above the strip
// that render throw blanks the window.
function dragMatchesStrip(drag: Drag, tabs: TabView[]): boolean {
  return tabs.length === drag.rects.length && tabs[drag.from]?.label === drag.label;
}

function previewOrder(size: number, from: number, to: number): number[] {
  const order = Array.from({ length: size }, (_, index) => index);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  return order;
}

function isOtherStripInZone(event: MouseEvent, source: HTMLElement, zone: string): boolean {
  if (!(event.target instanceof Element)) return false;
  const target = event.target.closest<HTMLElement>('[data-tab-drop-zone]');
  return target !== null && target !== source && target.dataset.tabDropZone === zone;
}

export function useTabReorder(
  tabs: TabView[],
  onReorder?: (from: number, to: number) => void,
  crossStripDrop?: CrossStripDrop,
) {
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The drag callbacks outlive the render that created them, and reconciling against the list as it
  // stood at `mousedown` would miss exactly the change this is here to catch.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const callbackRef = useRef(onReorder);
  callbackRef.current = onReorder;
  const crossStripDropRef = useRef(crossStripDrop);
  crossStripDropRef.current = crossStripDrop;

  const cancel = useCallback(() => {
    const current = dragRef.current;
    if (!current?.started) return;
    current.cancelled = true;
    current.started = false;
    setDrag(null);
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent): void => {
    if (event.key === 'Escape') cancel();
  }, [cancel]);

  useEffect(() => () => {
    globalThis.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const begin = useCallback((from: number, down: React.MouseEvent) => {
    const label = tabsRef.current[from]?.label;
    if (!callbackRef.current || down.button !== 0 || label === undefined) return;
    const current: Drag = {
      from,
      label,
      to: from,
      origin: { x: down.clientX, y: down.clientY },
      pointer: { x: down.clientX, y: down.clientY },
      rects: [],
      cancelled: false,
      started: false,
    };
    dragRef.current = current;
    startDrag((move) => {
      if (current.cancelled) return;
      const pointer = { x: move.clientX, y: move.clientY };
      if (!current.started) {
        if (Math.hypot(pointer.x - current.origin.x, pointer.y - current.origin.y) < DRAG_THRESHOLD_PX) return;
        const strip = stripRef.current;
        if (!strip) return;
        current.rects = measuredTabs(strip);
        current.started = true;
        globalThis.addEventListener('keydown', onKeyDown);
      }
      move.preventDefault();
      current.pointer = pointer;
      // Once the strip has changed underneath it the drag is finished; the preview has already
      // unwound, and only the release still has to know not to act on it.
      if (!dragMatchesStrip(current, tabsRef.current)) return;
      current.to = nearestSlot(current.rects, pointer, allowedRange(tabsRef.current, current.from));
      setDrag({ ...current });
    }, (up) => {
      globalThis.removeEventListener('keydown', onKeyDown);
      if (current.started && !current.cancelled && dragMatchesStrip(current, tabsRef.current)) {
        const crossDrop = crossStripDropRef.current;
        const strip = stripRef.current;
        if (crossDrop && strip && isOtherStripInZone(up, strip, crossDrop.zone)) {
          crossDrop.onDrop(current.from);
        } else if (current.to !== current.from) {
          callbackRef.current?.(current.from, current.to);
        }
      }
      dragRef.current = null;
      setDrag(null);
    });
  }, [onKeyDown]);

  const transformFor = (index: number): TabDragTransform | undefined => {
    if (!drag) return undefined;
    if (!dragMatchesStrip(drag, tabs)) return undefined;
    if (index === drag.from) {
      return {
        x: drag.pointer.x - drag.origin.x,
        y: drag.pointer.y - drag.origin.y,
        dragged: true,
      };
    }
    const order = previewOrder(tabs.length, drag.from, drag.to);
    const slot = order.indexOf(index);
    return {
      x: drag.rects[slot].x - drag.rects[index].x,
      y: drag.rects[slot].y - drag.rects[index].y,
      dragged: false,
    };
  };

  return { stripRef, begin, transformFor };
}
