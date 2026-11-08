import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IDecorationOptions, IMarker, Terminal } from '@xterm/xterm';
import { addThinkingMarker } from './thinking-marker-decoration';
import type { ThinkingMarkerView } from './thinking-marker-decoration';

const CELL = 10;
const ROW_HEIGHT = 12;
const NAME = 'acp:ask:shell';
const LONG_ROW = 'x'.repeat(100);
const STALE_ROW = `> ls${'\u{0}'.repeat(146)}x`;

type RowSpec = { text: string; wrapped?: boolean; length?: number };

type FakeOptions = {
  rows?: RowSpec[];
  markerLine?: number;
  viewportY?: number;
  buffer?: string;
  withScreen?: boolean;
  screenHeight?: number;
  cols?: number;
  termRows?: number;
  registers?: boolean;
  runningWidth?: number;
  linkWidth?: number;
};

type Fake = {
  terminal: Terminal;
  container: HTMLElement;
  element: HTMLElement;
  rows: RowSpec[];
  marker: { line: number; dispose: ReturnType<typeof vi.fn> };
  active: { type: string; viewportY: number };
  getLine: ReturnType<typeof vi.fn>;
  registered: IDecorationOptions[];
  decoration: { dispose: ReturnType<typeof vi.fn>; handler?: (element: HTMLElement) => void };
  termRows: number;
};

function cellsOf(text: string): { chars: string; width: number }[] {
  return [...text].flatMap((char) => {
    if (char === '\u{0}') return [{ chars: '', width: 1 }];
    if ((char.codePointAt(0) ?? 0) > 0x2e_7f) return [{ chars: char, width: 2 }, { chars: '', width: 0 }];
    return [{ chars: char, width: 1 }];
  });
}

function bufferLine(spec: RowSpec, cols: number) {
  const content = cellsOf(spec.text);
  return {
    isWrapped: spec.wrapped ?? false,
    length: spec.length ?? cols,
    getCell: (x: number) => {
      const cell = content[x] ?? { chars: '', width: 1 };
      return { getChars: () => cell.chars, getWidth: () => cell.width };
    },
  };
}

function fakeTerminal({
  rows = [{ text: '> ls' }], markerLine = 0, viewportY = 0, buffer = 'normal', withScreen = true,
  screenHeight = 240, cols = 100, termRows = 20, registers = true, runningWidth = 100, linkWidth = 190,
}: FakeOptions = {}): Fake {
  const container = document.createElement('div');
  const element = document.createElement('div');
  container.append(element);
  if (withScreen) {
    const screen = document.createElement('div');
    screen.className = 'xterm-screen';
    Object.defineProperties(screen, { clientHeight: { value: screenHeight }, clientWidth: { value: cols * CELL } });
    container.append(screen);
  }
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    () => (element.dataset.kind === 'link' ? linkWidth : runningWidth),
  );
  const lines = [...rows];
  const getLine = vi.fn((y: number) => {
    const spec = lines[y];
    return spec ? bufferLine(spec, cols) : undefined;
  });
  const active = { type: buffer, viewportY, getLine };
  const fake: Fake = {
    terminal: {
      element: withScreen ? container : undefined,
      rows: termRows,
      cols,
      buffer: { active },
      registerDecoration: (options: IDecorationOptions) => {
        fake.registered.push(options);
        return registers ? {
          dispose: fake.decoration.dispose,
          onRender: (handler: (element: HTMLElement) => void) => { fake.decoration.handler = handler; },
        } : undefined;
      },
    } as unknown as Terminal,
    container,
    element,
    rows: lines,
    marker: { line: markerLine, dispose: vi.fn() },
    active,
    getLine,
    registered: [],
    decoration: { dispose: vi.fn() },
    termRows,
  };
  return fake;
}

function view(kind: 'running' | 'link' = 'running', onOpen: () => void = vi.fn()): ThinkingMarkerView {
  return { kind, name: NAME, onOpen };
}

function mount(options: FakeOptions = {}, first: ThinkingMarkerView = view()) {
  const fake = fakeTerminal(options);
  const handle = addThinkingMarker(fake.terminal, fake.marker as unknown as IMarker, first);
  return { fake, handle };
}

function render(fake: Fake, { shown = false } = {}): HTMLElement {
  const { element, active, marker } = fake;
  const row = marker.line - active.viewportY;
  if ((row < 0 || row >= fake.termRows) && !shown) {
    element.style.display = 'none';
  } else {
    element.style.display = active.type === 'alternate' && !shown ? 'none' : 'block';
    element.style.width = `${CELL}px`;
    element.style.top = `${row * ROW_HEIGHT}px`;
  }
  fake.decoration.handler?.(element);
  return element;
}

function dispatch(element: HTMLElement, type: string, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

describe('addThinkingMarker', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('registers a one cell decoration on the marker in the top layer', () => {
    const { fake } = mount();

    expect(fake.registered).toEqual([{ marker: fake.marker, width: 1, height: 1, layer: 'top' }]);
  });

  describe('placement', () => {
    it('sits one cell after the row text, in pixels from the left, on the row it was rendered for', () => {
      const { fake } = mount({ rows: [{ text: '> ls' }] });

      const element = render(fake);

      expect(element.style.marginLeft).toBe('50px');
      expect(element.style.width).toBe('auto');
      expect(element.style.top).toBe('0px');
      expect(element.style.display).toBe('block');
    });

    it('counts a wide character as two cells and the empty cells after the text as none', () => {
      const { fake } = mount({ rows: [{ text: '> 日本' }] });

      expect(render(fake).style.marginLeft).toBe('70px');
    });

    it('reads no further than the columns when the row is longer after a resize', () => {
      const { fake } = mount({ rows: [{ text: STALE_ROW, length: 200 }] });

      expect(render(fake).style.marginLeft).toBe('50px');
    });

    it('places an empty row one cell from the left edge', () => {
      const { fake } = mount({ rows: [{ text: '' }] });

      expect(render(fake).style.marginLeft).toBe('10px');
    });

    it('never writes the left position, which xterm clears on a resize', () => {
      const { fake } = mount();
      const element = render(fake);
      expect(element.style.left).toBe('');

      element.style.left = '';
      fake.decoration.handler?.(element);

      expect(element.style.left).toBe('');
      expect(element.style.marginLeft).toBe('50px');
    });

    it('re-applies its geometry after xterm resets the size and top on a render', () => {
      const { fake } = mount({ rows: [{ text: '> ls' }, { text: 'out' }], markerLine: 1 });

      const element = render(fake);
      render(fake);

      expect(element.style.width).toBe('auto');
      expect(element.style.top).toBe('12px');
      expect(element.style.marginLeft).toBe('40px');
    });

    it('sits at the right edge over the last cells when the row is full', () => {
      const { fake } = mount({ rows: [{ text: LONG_ROW }] });

      expect(render(fake).style.marginLeft).toBe('900px');
    });

    it.each([
      [88, '890px'],
      [89, '900px'],
      [90, '900px'],
    ])('places the element after %i text cells at %s, never past the right edge', (cells, expected) => {
      const { fake } = mount({ rows: [{ text: 'x'.repeat(cells) }] });

      expect(render(fake).style.marginLeft).toBe(expected);
    });

    it('sits at zero when it is wider than the screen', () => {
      const { fake } = mount({ rows: [{ text: LONG_ROW }], runningWidth: 1200 });

      expect(render(fake).style.marginLeft).toBe('0px');
    });

    it('moves after the row text changes and it renders again', () => {
      const { fake } = mount({ rows: [{ text: '> ls' }] });
      expect(render(fake).style.marginLeft).toBe('50px');

      fake.rows[0] = { text: '> ls -la' };

      expect(render(fake).style.marginLeft).toBe('90px');
    });

    it.each([0, 2])('is placed against the last row of a wrapped line when the marker is on row %i', (markerLine) => {
      const { fake } = mount({
        rows: [{ text: LONG_ROW }, { text: LONG_ROW, wrapped: true }, { text: 'abc', wrapped: true }],
        markerLine,
      });

      const element = render(fake);

      expect(element.style.top).toBe('24px');
      expect(element.style.marginLeft).toBe('40px');
      expect(element.style.display).toBe('block');
    });

    it('stops at the next line that is not a continuation', () => {
      const { fake } = mount({
        rows: [{ text: LONG_ROW }, { text: 'abc', wrapped: true }, { text: 'next', wrapped: false }],
      });

      const element = render(fake);

      expect(element.style.top).toBe('12px');
      expect(element.style.marginLeft).toBe('40px');
    });

    it('hides when the marker row is gone from the buffer', () => {
      const { fake } = mount({ rows: [{ text: '> ls' }] });
      expect(render(fake).style.display).toBe('block');

      fake.rows.length = 0;

      expect(render(fake).style.display).toBe('none');
    });

    it('hides while the alternate buffer is active and returns with the normal one', () => {
      const { fake } = mount();
      expect(render(fake).style.display).toBe('block');

      fake.active.type = 'alternate';
      expect(render(fake, { shown: true }).style.display).toBe('none');

      fake.active.type = 'normal';
      expect(render(fake).style.display).toBe('block');
    });

    it('hides when the placed row is above the viewport', () => {
      const { fake } = mount({ rows: [{ text: '> ls' }, { text: 'out' }], markerLine: 0, viewportY: 1 });

      expect(render(fake, { shown: true }).style.display).toBe('none');
    });

    it('hides when the placed row is below the viewport', () => {
      const rows = Array.from({ length: 26 }, () => ({ text: '' }));
      const { fake } = mount({ rows, markerLine: 25 });

      expect(render(fake, { shown: true }).style.display).toBe('none');
    });

    it('hides when the marker row is inside the viewport but the last row of its line is below', () => {
      const rows = Array.from({ length: 22 }, (_, y) => ({ text: 'x', wrapped: y > 18 }));
      const { fake } = mount({ rows, markerLine: 18 });

      expect(render(fake).style.display).toBe('none');
    });

    it('shows when the marker row is above the viewport but the last row of its line is inside', () => {
      const { fake } = mount({
        rows: [{ text: LONG_ROW }, { text: LONG_ROW, wrapped: true }, { text: 'abc', wrapped: true }],
        markerLine: 0,
        viewportY: 1,
      });

      const element = render(fake);

      expect(element.style.display).toBe('block');
      expect(element.style.top).toBe('12px');
    });

    it('hides when the marker was disposed', () => {
      const { fake } = mount();
      expect(render(fake).style.display).toBe('block');

      fake.marker.line = -1;

      expect(render(fake, { shown: true }).style.display).toBe('none');
    });

    it('hides when the screen has no height yet', () => {
      const { fake } = mount({ screenHeight: 0 });

      expect(render(fake).style.display).toBe('none');
    });

    it('fills the content but leaves the element as xterm made it when there is no screen', () => {
      const { fake } = mount({ withScreen: false });

      const element = render(fake);

      expect(element.textContent).toBe('Thinking');
      expect(element.style.display).toBe('block');
      expect(element.style.top).toBe('0px');
      expect(element.style.width).toBe(`${CELL}px`);
      expect(element.style.marginLeft).toBe('');
      expect(fake.getLine).not.toHaveBeenCalled();
    });

    it('applies a later view without a screen and still reads no row', () => {
      const { fake, handle } = mount({ withScreen: false });
      const element = render(fake);

      handle.show(view('link'));

      expect(element.textContent).toBe('see thought process');
      expect(element.style.marginLeft).toBe('');
      expect(fake.getLine).not.toHaveBeenCalled();
    });
  });

  describe('content', () => {
    it('fills once however often it renders', () => {
      const { fake } = mount();
      const element = render(fake);
      element.append(document.createElement('i'));

      render(fake);

      expect(element.querySelectorAll('i')).toHaveLength(1);
      expect(element.querySelectorAll('span')).toHaveLength(1);
    });

    it('does not replace the spinner on a later render', () => {
      const { fake } = mount();
      const spinner = render(fake).querySelector('svg');

      render(fake);

      expect(spinner).not.toBeNull();
      expect(fake.element.querySelector('svg')).toBe(spinner);
    });

    it('honors a view shown before the first render', () => {
      const { fake, handle } = mount();

      handle.show(view('link'));
      const element = render(fake);

      expect(element.textContent).toBe('see thought process');
      expect(element.dataset.kind).toBe('link');
      expect(element.querySelector('svg')).toBeNull();
    });

    it('carries the marker class and a running label with a decorative spinning icon', () => {
      const { fake } = mount();

      const element = render(fake);

      expect(element).toHaveClass('shell-thinking-marker');
      expect(element.dataset.kind).toBe('running');
      expect(element.querySelector('span')?.textContent).toBe('Thinking');
      expect(element.textContent).toBe('Thinking');
      const spinner = element.querySelector('svg');
      expect(spinner).toHaveClass('fa-spin');
      expect(spinner).toHaveAttribute('aria-hidden', 'true');
      expect(element.lastElementChild).toBe(spinner);
    });

    it('draws the link without brackets or an icon', () => {
      const { fake } = mount({}, view('link'));

      const element = render(fake);

      expect(element.textContent).toBe('see thought process');
      expect(element.dataset.kind).toBe('link');
      expect(element.querySelector('svg')).toBeNull();
    });

    it.each(['running', 'link'] as const)('is a link named after the connection while %s', (kind) => {
      const { fake } = mount({}, view(kind));

      const element = render(fake);

      expect(element).toHaveAttribute('role', 'link');
      expect(element).toHaveAttribute('title', `Open ${NAME}`);
      expect(element).toHaveAttribute('aria-label', `Open ${NAME}`);
      expect(element).not.toHaveAttribute('tabindex');
    });

    it('switches from thinking to the link in place on the same element', () => {
      const { fake, handle } = mount();
      const element = render(fake);
      expect(element.textContent).toBe('Thinking');

      handle.show({ kind: 'link', name: 'acp:ask:other', onOpen: vi.fn() });

      expect(fake.element).toBe(element);
      expect(element.textContent).toBe('see thought process');
      expect(element.dataset.kind).toBe('link');
      expect(element.title).toBe('Open acp:ask:other');
      expect(element.getAttribute('aria-label')).toBe('Open acp:ask:other');
      expect(element).toHaveAttribute('role', 'link');
      expect(element).toHaveClass('shell-thinking-marker');
      expect(element.querySelector('svg')).toBeNull();
    });

    it('updates a running marker tooltip and accessible name when its record name changes', () => {
      const { fake, handle } = mount();
      const element = render(fake);

      handle.show({ ...view(), name: 'acp:ask:Renamed shell' });

      expect(element.dataset.kind).toBe('running');
      expect(element.title).toBe('Open acp:ask:Renamed shell');
      expect(element.getAttribute('aria-label')).toBe('Open acp:ask:Renamed shell');
      expect(element.textContent).toBe('Thinking');
    });

    it('places the element again at once when the view changes width', () => {
      const { fake, handle } = mount({ rows: [{ text: LONG_ROW }] });
      const element = render(fake);
      expect(element.style.marginLeft).toBe('900px');

      handle.show(view('link'));

      expect(element.style.marginLeft).toBe('810px');
    });
  });

  describe('presses', () => {
    it('calls the open callback of the current view once however often it rendered', () => {
      const onOpen = vi.fn();
      const { fake } = mount({}, view('running', onOpen));
      const element = render(fake);
      render(fake);

      dispatch(element, 'click');

      expect(onOpen).toHaveBeenCalledOnce();
    });

    it('calls the callback of a later view instead of the first', () => {
      const first = vi.fn();
      const next = vi.fn();
      const { fake, handle } = mount({}, view('running', first));
      const element = render(fake);
      handle.show(view('link', next));

      dispatch(element, 'click');

      expect(first).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledOnce();
    });

    it('lets a click bubble to the terminal host without preventing its default', () => {
      const { fake } = mount();
      const element = render(fake);
      const host = vi.fn();
      fake.container.addEventListener('click', host);

      const click = dispatch(element, 'click');

      expect(host).toHaveBeenCalledOnce();
      expect(click.defaultPrevented).toBe(false);
    });

    it.each([0, 1, 2])('keeps a button %i press away from the terminal and prevents its default', (button) => {
      const { fake } = mount();
      const element = render(fake);
      const host = vi.fn();
      fake.container.addEventListener('mousedown', host);

      const press = dispatch(element, 'mousedown', { button });

      expect(press.defaultPrevented).toBe(true);
      expect(host).not.toHaveBeenCalled();
    });
  });

  describe('lifetime', () => {
    it('disposes the decoration and the marker once and ignores a later show', () => {
      const { fake, handle } = mount();
      const element = render(fake);

      handle.remove();
      handle.remove();
      handle.show(view('link'));

      expect(fake.decoration.dispose).toHaveBeenCalledOnce();
      expect(fake.marker.dispose).toHaveBeenCalledOnce();
      expect(element.textContent).toBe('Thinking');
    });

    it('gives an inert handle when the terminal registers no decoration', () => {
      const { fake, handle } = mount({ registers: false });

      expect(() => {
        handle.show(view('link'));
        handle.remove();
      }).not.toThrow();
      expect(fake.getLine).not.toHaveBeenCalled();
    });
  });
});
