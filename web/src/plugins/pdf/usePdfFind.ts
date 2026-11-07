import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  announcement: string;
  current: PdfFindCurrent | null;
};

function finalAnnouncement(query: string, count: number): string {
  if (!query.trim()) return 'Document text is ready to search.';
  if (count === 0) return 'No matching lines.';
  if (count === 10) return '10 or more matching lines found.';
  return `${count} matching ${count === 1 ? 'line' : 'lines'} found.`;
}

export function usePdfFind({ active, pdf, revealLine, inputRef }: PdfFindOptions): PdfFindApi {
  const [lines, setLines] = useState<PdfLine[] | null>(null);
  const [reading, setReading] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const started = useRef(false);
  const mounted = useRef(true);
  const readGeneration = useRef(0);
  const returnTo = useRef<HTMLElement | null>(null);
  const announcedReading = useRef(false);
  const announcedResults = useRef(false);

  const lineTexts = useMemo(() => lines?.map((line) => line.text) ?? null, [lines]);
  const find = useLineFind(lineTexts, active);
  const {
    findOpen, query, results, selected, open: openFind, close: closeFind, setSelected,
  } = find;

  useEffect(() => {
    if (!findOpen) {
      announcedReading.current = false;
      announcedResults.current = false;
      setAnnouncement('');
      return;
    }
    if (reading && !announcedReading.current) {
      announcedReading.current = true;
      setAnnouncement('Reading document text.');
    }
    if (reading && query.trim() && results.length > 0 && !announcedResults.current) {
      announcedResults.current = true;
      setAnnouncement('Matching results are available.');
    }
    if (!reading && announcedReading.current) {
      announcedReading.current = false;
      setAnnouncement(finalAnnouncement(query, results.length));
    } else if (!reading && query.trim()) {
      setAnnouncement(finalAnnouncement(query, results.length));
    }
  }, [findOpen, query, reading, results.length]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useLayoutEffect(() => {
    if (pdf !== null) return;
    readGeneration.current++;
    setLines(null);
    setReading(false);
  }, [pdf]);

  const read = useCallback(async (source: LoadedPdf, generation: number) => {
    for (let index = 0; index < source.pageSizes.length; index++) {
      if (!mounted.current || generation !== readGeneration.current) return;
      try {
        const items = await source.readPageText(index);
        if (!mounted.current || generation !== readGeneration.current) return;
        setLines((current) => [...(current ?? []), ...pageLines(index, items)]);
      } catch {
        if (!mounted.current || generation !== readGeneration.current) return;
      }
    }
    if (mounted.current && generation === readGeneration.current) setReading(false);
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
    const generation = ++readGeneration.current;
    setLines([]);
    setReading(pdf.pageSizes.length > 0);
    void read(pdf, generation);
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

  const result = results[selected];
  const line = result === undefined ? undefined : lines?.[result.index];
  const page = line?.page;
  const lineIndex = line?.index;
  const start = result?.ranges[0]?.[0];
  const current = useMemo(
    () => (page === undefined || lineIndex === undefined || start === undefined
      ? null
      : { page, line: lineIndex, start }),
    [page, lineIndex, start],
  );

  return { ...find, open, select, close, lines, reading, announcement, current };
}
