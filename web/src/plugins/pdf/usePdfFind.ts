import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { isTextEntryElement, useLineFind } from '../api';
import type { LoadedPdf } from './pdf-document';
import { pageLines, type PdfLine } from './pdf-find-lines';

export type PdfFindOptions = {
  active: boolean;
  pdf: LoadedPdf | null;
  revealLine(page: number, top: number): void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export type PdfFindCurrent = {
  page: number;
  line: number;
  start: number;
};

export type PdfFindApi = Omit<ReturnType<typeof useLineFind>, 'open' | 'close'> & {
  open(): void;
  close(): void;
  select(index: number): void;
  lines: PdfLine[] | null;
  reading: boolean;
  current: PdfFindCurrent | null;
};

export function usePdfFind({ active, pdf, revealLine, inputRef }: PdfFindOptions): PdfFindApi {
  const [lines, setLines] = useState<PdfLine[] | null>(null);
  const [reading, setReading] = useState(false);
  const started = useRef(false);
  const mounted = useRef(true);
  const returnTo = useRef<HTMLElement | null>(null);

  const lineTexts = useMemo(() => lines?.map((line) => line.text) ?? null, [lines]);
  const find = useLineFind(lineTexts, active);
  const {
    findOpen, results, selected, open: openFind, close: closeFind, setSelected,
  } = find;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const read = useCallback(async (source: LoadedPdf) => {
    for (let index = 0; index < source.pageSizes.length; index++) {
      try {
        const items = await source.readPageText(index);
        if (!mounted.current) return;
        setLines((current) => [...(current ?? []), ...pageLines(index, items)]);
      } catch {
        if (!mounted.current) return;
      }
    }
    if (mounted.current) setReading(false);
  }, []);

  const open = useCallback(() => {
    if (findOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    if (pdf === null) return;
    const focused = document.activeElement;
    returnTo.current = focused instanceof HTMLElement ? focused : null;
    openFind('');
    if (started.current) return;
    started.current = true;
    setLines([]);
    setReading(pdf.pageSizes.length > 0);
    void read(pdf);
  }, [findOpen, inputRef, openFind, pdf, read]);

  const select = useCallback((index: number) => {
    if (index < 0) return;
    setSelected(index);
    const result = results[index];
    const line = result === undefined ? undefined : lines?.[result.index];
    if (result !== undefined && line !== undefined) revealLine(line.page, line.top);
  }, [lines, results, revealLine, setSelected]);

  const close = useCallback(() => {
    closeFind();
    const origin = returnTo.current;
    if (!origin?.isConnected) return;
    const focused = document.activeElement;
    if (focused !== inputRef.current && isTextEntryElement(focused)) return;
    origin.focus({ preventScroll: true });
  }, [closeFind, inputRef]);

  useEffect(() => {
    if (pdf === null && findOpen) closeFind();
  }, [closeFind, findOpen, pdf]);

  const current = useMemo(() => {
    const result = results[selected];
    if (result === undefined) return null;
    const line = lines?.[result.index];
    const range = result.ranges[0];
    if (line === undefined || range === undefined) return null;
    return { page: line.page, line: line.index, start: range[0] };
  }, [lines, results, selected]);

  return { ...find, open, select, close, lines, reading, current };
}
