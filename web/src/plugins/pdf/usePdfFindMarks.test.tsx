import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_FIND_CURRENT, PDF_FIND_MATCH } from './pdf-find-marks';
import { usePdfFindMarks } from './usePdfFindMarks';
import type { PdfFindCurrent } from './usePdfFind';

type MarksProps = {
  open: boolean;
  query: string;
  current: PdfFindCurrent | null;
  stageRef: { current: HTMLDivElement | null };
  textLayerVersion: number;
};

let highlights: Map<string, Set<Range>>;

beforeEach(() => {
  highlights = new Map();
  vi.stubGlobal('CSS', { highlights });
  vi.stubGlobal('Highlight', class extends Set<Range> {});
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function fill(layer: HTMLElement, ...lines: string[]): void {
  for (const line of lines) {
    const span = document.createElement('span');
    span.textContent = line;
    layer.append(span, document.createElement('br'));
  }
}

function addPage(stage: HTMLElement, page: string | null, ...lines: string[]): HTMLElement {
  const element = document.createElement('div');
  element.className = 'pdf-page';
  if (page !== null) element.dataset.page = page;
  const layer = document.createElement('div');
  layer.className = 'pdf-text-layer';
  fill(layer, ...lines);
  element.append(layer);
  stage.append(element);
  return layer;
}

function makeStage(): HTMLDivElement {
  const stage = document.createElement('div');
  stage.className = 'pdf-stage';
  document.body.append(stage);
  return stage;
}

function propsFor(stage: HTMLDivElement, overrides: Partial<MarksProps> = {}): MarksProps {
  return {
    open: true,
    query: 'needle',
    current: null,
    stageRef: { current: stage },
    textLayerVersion: 0,
    ...overrides,
  };
}

function mount(props: MarksProps) {
  return renderHook((input: MarksProps) => usePdfFindMarks(input), { initialProps: props });
}

function marks(name: string): Range[] {
  return [...highlights.get(name) ?? []];
}

function markTexts(name: string): string[] {
  return marks(name).map((range) => range.toString());
}

function textNode(layer: HTMLElement, index = 0): ChildNode | undefined {
  return layer.querySelectorAll('span')[index]?.firstChild ?? undefined;
}

describe('usePdfFindMarks', () => {
  it('paints occurrences from every drawn layer', () => {
    const stage = makeStage();
    addPage(stage, '0', 'needle here');
    addPage(stage, '1', 'needle there');

    mount(propsFor(stage));

    expect(markTexts(PDF_FIND_MATCH)).toEqual(['needle', 'needle']);
  });

  it('marks the current occurrence apart from the others', () => {
    const stage = makeStage();
    const first = addPage(stage, '0', 'needle');
    const second = addPage(stage, '1', 'needle');

    mount(propsFor(stage, { current: { page: 1, line: 0, start: 0 } }));

    const [current] = marks(PDF_FIND_CURRENT);
    expect(current?.startContainer).toBe(textNode(second));
    expect(current?.startOffset).toBe(0);
    expect(marks(PDF_FIND_MATCH)).toHaveLength(1);
    expect(marks(PDF_FIND_MATCH)[0]?.startContainer).toBe(textNode(first));
  });

  it('moves the current mark when the highlighted row changes', () => {
    const stage = makeStage();
    const layer = addPage(stage, '0', 'needle first', 'needle second');
    const base = propsFor(stage, { current: { page: 0, line: 0, start: 0 } });
    const view = mount(base);

    view.rerender({ ...base, current: { page: 0, line: 1, start: 0 } });

    expect(marks(PDF_FIND_CURRENT)[0]?.startContainer).toBe(textNode(layer, 1));
    expect(marks(PDF_FIND_MATCH)).toHaveLength(1);
    expect(marks(PDF_FIND_MATCH)[0]?.startContainer).toBe(textNode(layer, 0));
  });

  it('replaces the previous ranges when the query changes', () => {
    const stage = makeStage();
    addPage(stage, '0', 'needle and hay');
    const base = propsFor(stage, { query: 'needle' });
    const view = mount(base);
    const previous = marks(PDF_FIND_MATCH);

    view.rerender({ ...base, query: 'hay' });

    const next = marks(PDF_FIND_MATCH);
    expect(next).toHaveLength(1);
    expect(next[0]?.toString()).toBe('hay');
    expect(previous.some((range) => next.includes(range))).toBe(false);
  });

  it('repaints a replaced text layer when the version bumps', () => {
    const stage = makeStage();
    const layer = addPage(stage, '0', 'needle');
    const base = propsFor(stage);
    const view = mount(base);
    const previous = marks(PDF_FIND_MATCH);

    layer.replaceChildren();
    fill(layer, 'needle again');
    view.rerender({ ...base, textLayerVersion: 1 });

    const next = marks(PDF_FIND_MATCH);
    expect(next).toHaveLength(1);
    expect(next[0]?.startContainer).toBe(textNode(layer));
    expect(previous.some((range) => next.includes(range))).toBe(false);
  });

  it('clears every layer when the overlay closes', () => {
    const stage = makeStage();
    addPage(stage, '0', 'needle here');
    addPage(stage, '1', 'needle there');
    const base = propsFor(stage);
    const view = mount(base);

    view.rerender({ ...base, open: false });

    expect(marks(PDF_FIND_MATCH)).toEqual([]);
    expect(marks(PDF_FIND_CURRENT)).toEqual([]);
  });

  it('clears every layer on unmount', () => {
    const stage = makeStage();
    addPage(stage, '0', 'needle here');
    addPage(stage, '1', 'needle there');
    const view = mount(propsFor(stage));

    view.unmount();

    expect(marks(PDF_FIND_MATCH)).toEqual([]);
    expect(marks(PDF_FIND_CURRENT)).toEqual([]);
  });

  it('paints nothing while the overlay is closed', () => {
    const stage = makeStage();
    addPage(stage, '0', 'needle');

    mount(propsFor(stage, { open: false }));

    expect(highlights.size).toBe(0);
  });

  it('clears every layer when the query becomes empty', () => {
    const stage = makeStage();
    addPage(stage, '0', 'needle here');
    addPage(stage, '1', 'needle there');
    const base = propsFor(stage);
    const view = mount(base);

    view.rerender({ ...base, query: '  ' });

    expect(marks(PDF_FIND_MATCH)).toEqual([]);
  });

  it('leaves every occurrence normal when the current row is not drawn', () => {
    const stage = makeStage();
    addPage(stage, '0', 'needle');
    const base = propsFor(stage, { current: { page: 0, line: 4, start: 0 } });
    const view = mount(base);

    expect(marks(PDF_FIND_CURRENT)).toEqual([]);
    expect(marks(PDF_FIND_MATCH)).toHaveLength(1);

    view.rerender({ ...base, current: { page: 9, line: 0, start: 0 } });

    expect(marks(PDF_FIND_CURRENT)).toEqual([]);
    expect(marks(PDF_FIND_MATCH)).toHaveLength(1);
  });

  it('skips layers without a page and pages with an unusable index', () => {
    const stage = makeStage();
    const orphan = document.createElement('div');
    orphan.className = 'pdf-text-layer';
    fill(orphan, 'needle');
    stage.append(orphan);
    addPage(stage, null, 'needle');
    addPage(stage, '', 'needle');
    addPage(stage, 'one', 'needle');
    const drawn = addPage(stage, '2', 'needle');

    mount(propsFor(stage));

    expect(marks(PDF_FIND_MATCH)).toHaveLength(1);
    expect(marks(PDF_FIND_MATCH)[0]?.startContainer).toBe(textNode(drawn));
  });

  it('matches the current page against a zero-based data-page', () => {
    const stage = makeStage();
    const layer = addPage(stage, '0', 'needle');

    mount(propsFor(stage, { current: { page: 0, line: 0, start: 0 } }));

    expect(marks(PDF_FIND_CURRENT)[0]?.startContainer).toBe(textNode(layer));
  });
});
