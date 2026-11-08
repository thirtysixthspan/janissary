import { useEffect } from 'react';
import type { RefObject } from 'react';
import { occurrencesInLayer, paintMarks } from './pdf-find-marks';
import type { PdfFindCurrent } from './usePdfFind';

type PdfFindMarksOptions = {
  open: boolean;
  query: string;
  current: PdfFindCurrent | null;
  stageRef: RefObject<HTMLDivElement | null>;
  textLayerVersion: number;
};

function pageIndex(layer: Element): number | null {
  const page = layer.closest('.pdf-page');
  const attribute = page instanceof HTMLElement ? page.dataset.page : undefined;
  if (attribute === undefined || attribute.trim() === '') return null;
  const index = Number(attribute);
  return Number.isSafeInteger(index) ? index : null;
}

function currentRange(
  layer: Element, query: string, page: number, current: PdfFindCurrent | null,
): { ranges: Range[]; current: Range | null } {
  const occurrences = occurrencesInLayer(layer, query);
  const selected = current !== null && current.page === page
    ? occurrences.find((occurrence) => occurrence.line === current.line && occurrence.start === current.start)
    : undefined;
  return {
    ranges: occurrences.map((occurrence) => occurrence.range),
    current: selected?.range ?? null,
  };
}

export function usePdfFindMarks({ open, query, current, stageRef, textLayerVersion }: PdfFindMarksOptions): void {
  useEffect(() => {
    const stage = stageRef.current;
    const trimmed = query.trim();
    if (!open || stage === null || !trimmed) return;
    const cleanups: (() => void)[] = [];
    for (const layer of stage.querySelectorAll('.pdf-text-layer')) {
      const page = pageIndex(layer);
      if (page === null) continue;
      const marks = currentRange(layer, trimmed, page, current);
      if (marks.ranges.length === 0) continue;
      cleanups.push(paintMarks(marks.ranges, marks.current));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [current, open, query, stageRef, textLayerVersion]);
}
