import { act, renderHook, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PdfFindApi } from './usePdfFind';
import { usePdfFind } from './usePdfFind';
import type { LoadedPdf } from './pdf-document';
import type { PdfTextItem } from './pdf-find-lines';

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
};

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web target excludes ES2024.
  const promise = new Promise<Value>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function line(text: string, top = 0.25): PdfTextItem {
  return { text, hasEOL: true, top };
}

function makePdf(pages: PdfTextItem[][]): LoadedPdf {
  return {
    pageSizes: pages.map(() => ({ width: 600, height: 800 })),
    renderPage: vi.fn(async () => {}),
    readPageText: vi.fn(async (index: number) => pages[index] ?? []),
    destroy: vi.fn(),
  };
}

function deferredPdf(pages: number) {
  const reads = Array.from({ length: pages }, () => deferred<PdfTextItem[]>());
  const readPageText = vi.fn((index: number) => reads[index].promise);
  const pdf: LoadedPdf = {
    pageSizes: Array.from({ length: pages }, () => ({ width: 600, height: 800 })),
    renderPage: vi.fn(async () => {}),
    readPageText,
    destroy: vi.fn(),
  };
  return { pdf, readPageText, reads };
}

function setup(pdf: LoadedPdf | null) {
  const input = document.createElement('input');
  document.body.append(input);
  const inputRef: RefObject<HTMLInputElement | null> = { current: input };
  const revealLine = vi.fn();
  const view = renderHook(
    ({ currentPdf }: { currentPdf: LoadedPdf | null }) =>
      usePdfFind({ active: true, pdf: currentPdf, revealLine, inputRef }),
    { initialProps: { currentPdf: pdf } },
  );
  return { ...view, input, revealLine };
}

async function openAndFinish(result: { current: PdfFindApi }) {
  act(() => { result.current.open(); });
  await waitFor(() => { expect(result.current.reading).toBe(false); });
}

afterEach(() => { document.body.replaceChildren(); });

describe('usePdfFind reading', () => {
  it('fills the lines page by page and reads until the last page resolves', async () => {
    const { pdf, readPageText, reads } = deferredPdf(2);
    const { result } = setup(pdf);

    expect(result.current.lines).toBeNull();
    expect(result.current.reading).toBe(false);

    act(() => { result.current.open(); });
    expect(result.current.lines).toEqual([]);
    expect(result.current.reading).toBe(true);

    await act(async () => { reads[0].resolve([line('first')]); });
    expect(result.current.lines?.map((item) => item.text)).toEqual(['first']);
    expect(result.current.reading).toBe(true);

    await act(async () => { reads[1].resolve([line('second')]); });
    expect(result.current.lines?.map((item) => item.text)).toEqual(['first', 'second']);
    expect(result.current.reading).toBe(false);
    expect(readPageText).toHaveBeenCalledTimes(2);
  });

  it('skips a rejected page and keeps reading the rest', async () => {
    const { pdf, reads } = deferredPdf(2);
    const { result } = setup(pdf);
    act(() => { result.current.open(); });

    await act(async () => { reads[0].reject(new Error('unreadable')); });
    expect(result.current.lines).toEqual([]);
    expect(result.current.reading).toBe(true);

    await act(async () => { reads[1].resolve([line('second')]); });
    expect(result.current.lines?.map((item) => item.text)).toEqual(['second']);
    expect(result.current.reading).toBe(false);
  });

  it('stops reading after the last page rejects', async () => {
    const { pdf, reads } = deferredPdf(2);
    const { result } = setup(pdf);
    act(() => { result.current.open(); });

    await act(async () => { reads[0].resolve([line('first')]); });
    await act(async () => { reads[1].reject(new Error('unreadable')); });

    expect(result.current.lines?.map((item) => item.text)).toEqual(['first']);
    expect(result.current.reading).toBe(false);
  });

  it('reads once across two opens', async () => {
    const pdf = makePdf([[line('alpha')], [line('beta')]]);
    const { result } = setup(pdf);
    await openAndFinish(result);

    act(() => { result.current.close(); });
    act(() => { result.current.open(); });

    expect(result.current.lines?.map((item) => item.text)).toEqual(['alpha', 'beta']);
    expect(result.current.reading).toBe(false);
    expect(vi.mocked(pdf.readPageText)).toHaveBeenCalledTimes(2);
  });

  it('keeps reading and the lines read so far when reopened mid-read', async () => {
    const { pdf, readPageText, reads } = deferredPdf(2);
    const { result } = setup(pdf);
    act(() => { result.current.open(); });
    await act(async () => { reads[0].resolve([line('first')]); });
    expect(readPageText).toHaveBeenCalledTimes(2);

    act(() => { result.current.close(); });
    act(() => { result.current.open(); });

    expect(result.current.reading).toBe(true);
    expect(result.current.lines?.map((item) => item.text)).toEqual(['first']);
    expect(readPageText).toHaveBeenCalledTimes(2);

    await act(async () => { reads[1].resolve([line('second')]); });
    expect(result.current.reading).toBe(false);
    expect(result.current.lines?.map((item) => item.text)).toEqual(['first', 'second']);
  });

  it('discards pending page text when the document becomes unavailable', async () => {
    const { pdf, readPageText, reads } = deferredPdf(3);
    const { result, rerender } = setup(pdf);
    act(() => { result.current.open(); });

    await act(async () => { reads[0].resolve([line('first')]); });
    expect(result.current.lines?.map((item) => item.text)).toEqual(['first']);
    expect(readPageText).toHaveBeenCalledTimes(2);

    act(() => { rerender({ currentPdf: null }); });
    expect(result.current.lines).toBeNull();
    expect(result.current.reading).toBe(false);

    await act(async () => { reads[1].resolve([line('stale')]); });

    expect(result.current.lines).toBeNull();
    expect(result.current.reading).toBe(false);
    expect(readPageText).toHaveBeenCalledTimes(2);
  });

  it('stops reading when the tab unmounts', async () => {
    const { pdf, readPageText, reads } = deferredPdf(2);
    const { result, unmount } = setup(pdf);
    act(() => { result.current.open(); });
    expect(readPageText).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => { reads[0].resolve([line('first')]); });

    expect(readPageText).toHaveBeenCalledTimes(1);
  });
});

describe('usePdfFind revealing', () => {
  it('keeps the first result selected when Down arrives before any result', async () => {
    const { pdf, reads } = deferredPdf(1);
    const { result } = setup(pdf);
    act(() => { result.current.open(); });
    act(() => { result.current.setQuery('needle'); });
    act(() => { result.current.select(-1); });

    await act(async () => { reads[0].resolve([line('needle')]); });

    expect(result.current.selected).toBe(0);
    expect(result.current.current).toEqual({ page: 0, line: 0, start: 0 });
  });

  it('asks for the matching line page and top fraction', async () => {
    const pdf = makePdf([[line('alpha', 0.4)], [line('beta', 0)]]);
    const { result, revealLine } = setup(pdf);
    await openAndFinish(result);

    act(() => { result.current.setQuery('beta'); });
    act(() => { result.current.select(0); });

    expect(revealLine).toHaveBeenCalledWith(1, 0);
  });

  it('reports the selected result page, line on the page, and range start', async () => {
    const pdf = makePdf([[line('alpha one'), line('beta')], [line('gamma')]]);
    const { result } = setup(pdf);
    await openAndFinish(result);

    act(() => { result.current.setQuery('beta'); });
    expect(result.current.current).toEqual({ page: 0, line: 1, start: 0 });

    act(() => { result.current.setQuery('gamma'); });
    expect(result.current.current).toEqual({ page: 1, line: 0, start: 0 });

    act(() => { result.current.setQuery('nothing'); });
    expect(result.current.current).toBeNull();
  });

  it('keeps current while a page read leaves the highlighted occurrence in place', async () => {
    const { pdf, reads } = deferredPdf(3);
    const { result } = setup(pdf);
    act(() => { result.current.open(); });
    act(() => { result.current.setQuery('needle'); });

    await act(async () => { reads[0].resolve([line('needle haystack')]); });
    const first = result.current.current;
    expect(first).toEqual({ page: 0, line: 0, start: 0 });

    await act(async () => { reads[1].resolve([line('hay')]); });
    expect(result.current.current).toBe(first);

    await act(async () => { reads[2].resolve([line('needle')]); });
    expect(result.current.current).not.toBe(first);
    expect(result.current.current).toEqual({ page: 2, line: 0, start: 0 });
  });
});

describe('usePdfFind focus', () => {
  it('restores the remembered element with preventScroll', async () => {
    const pdf = makePdf([[line('alpha')]]);
    const origin = document.createElement('button');
    document.body.append(origin);
    origin.focus();
    const { result } = setup(pdf);
    await openAndFinish(result);
    const focus = vi.spyOn(origin, 'focus');

    act(() => { result.current.close(); });

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('does not restore an element that has left the document', async () => {
    const pdf = makePdf([[line('alpha')]]);
    const origin = document.createElement('button');
    document.body.append(origin);
    origin.focus();
    const { result } = setup(pdf);
    await openAndFinish(result);
    const focus = vi.spyOn(origin, 'focus');
    origin.remove();

    act(() => { result.current.close(); });

    expect(focus).not.toHaveBeenCalled();
  });

  it('leaves focus in another text field', async () => {
    const pdf = makePdf([[line('alpha')]]);
    const origin = document.createElement('button');
    const other = document.createElement('input');
    document.body.append(origin, other);
    origin.focus();
    const { result } = setup(pdf);
    await openAndFinish(result);
    const focus = vi.spyOn(origin, 'focus');
    other.focus();

    act(() => { result.current.close(); });

    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(other);
  });

  it('focuses and selects the query when opening while already open', async () => {
    const pdf = makePdf([[line('alpha')], [line('beta')]]);
    const origin = document.createElement('button');
    const pageButton = document.createElement('button');
    document.body.append(origin, pageButton);
    origin.focus();
    const { result, input } = setup(pdf);
    await openAndFinish(result);
    act(() => { result.current.setQuery('alpha'); });
    input.value = 'alpha';
    pageButton.focus();

    act(() => { result.current.open(); });

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('alpha'.length);
    expect(result.current.query).toBe('alpha');
    expect(vi.mocked(pdf.readPageText)).toHaveBeenCalledTimes(2);

    act(() => { result.current.close(); });
    expect(document.activeElement).toBe(origin);
  });
});

describe('usePdfFind without a document', () => {
  it('does nothing when opened', () => {
    const { result } = setup(null);

    act(() => { result.current.open(); });

    expect(result.current.findOpen).toBe(false);
    expect(result.current.lines).toBeNull();
    expect(result.current.reading).toBe(false);
  });
});
