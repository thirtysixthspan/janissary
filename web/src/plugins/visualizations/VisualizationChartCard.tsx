import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate, faFileArrowDown, faFilePdf, faRepeat } from '@fortawesome/free-solid-svg-icons';
import type { VisualizationChart } from '@shared/plugins/visualizations/shared';
import { ChartSvg } from './chart/ChartSvg';
import { reduction } from './chart/describe';
import { VisualizationData } from './VisualizationData';
import { exportPdf, exportPng } from './export/download';

// One chart, and everything that belongs to it: the picture, the line under it saying what the picture
// is showing, the four controls that act on this chart alone, and the data table that is the chart's
// text alternative.
//
// The controls are here rather than in the tab's metadata row because they are per chart, and they are
// four icon buttons rather than dropdowns because the tab has none: the live-update control steps
// through the intervals on each click and says in its tooltip both where it is and where a click goes,
// which is the whole of what a menu offered and it costs one control instead of a panel.

export const REFRESH_CHOICES: readonly { label: string; seconds: number }[] = [
  { label: 'off', seconds: 0 },
  { label: '10s', seconds: 10 },
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
];

export type CardProperties = {
  chart: VisualizationChart;
  busy: boolean;
  disabled: boolean;
  onSetRefresh(chartId: string, seconds: number): void;
  onRefreshNow(chartId: string): void;
};

export function VisualizationChartCard({
  chart, busy, disabled, onSetRefresh, onRefreshNow,
}: CardProperties): React.ReactElement {
  // The chart element itself, because export rasterizes what is on screen rather than redrawing it.
  const chartRef = useRef<SVGSVGElement>(null);
  const [exportFailure, setExportFailure] = useState('');

  const next = nextInterval(chart.refreshSeconds);
  const exportChart = async (kind: 'png' | 'pdf') => {
    const svg = chartRef.current;
    if (!svg) return;
    try {
      if (kind === 'png') await exportPng(svg, chart.title);
      else await exportPdf(svg, chart.title);
      setExportFailure('');
    } catch (error) {
      setExportFailure(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <figure className="visualization-card">
      <ChartSvg ref={chartRef} chart={chart} table={chart.table} />
      <figcaption>{caption(chart)}</figcaption>
      {exportFailure === '' ? null : <p className="visualization-export-error">{exportFailure}</p>}
      <div className="visualization-card-actions">
        <button
          type="button"
          title="Read the data now"
          disabled={disabled || busy}
          onClick={() => { onRefreshNow(chart.id); }}
        >
          <FontAwesomeIcon icon={faArrowsRotate} />
        </button>
        <button
          type="button"
          title={liveUpdateTitle(chart.refreshSeconds, next.seconds)}
          aria-label={liveUpdateTitle(chart.refreshSeconds, next.seconds)}
          disabled={disabled || busy}
          onClick={() => { onSetRefresh(chart.id, next.seconds); }}
        >
          <FontAwesomeIcon icon={faRepeat} />
        </button>
        <button
          type="button"
          title="Export this chart as PNG"
          disabled={disabled || busy}
          onClick={() => { void exportChart('png'); }}
        >
          <FontAwesomeIcon icon={faFileArrowDown} />
        </button>
        <button
          type="button"
          title="Export this chart as PDF"
          disabled={disabled || busy}
          onClick={() => { void exportChart('pdf'); }}
        >
          <FontAwesomeIcon icon={faFilePdf} />
        </button>
      </div>
      <VisualizationData chart={chart} table={chart.table} />
    </figure>
  );
}

function nextInterval(seconds: number): { label: string; seconds: number } {
  const at = REFRESH_CHOICES.findIndex((choice) => choice.seconds === seconds);
  return REFRESH_CHOICES[at === -1 ? 0 : (at + 1) % REFRESH_CHOICES.length] ?? { label: 'off', seconds: 0 };
}

// Where the control is now and where one click goes, because a button that only shows a glyph leaves
// both to be guessed at.
function liveUpdateTitle(current: number, next: number): string {
  const now = label(current);
  return `Live update is ${now} — click for ${label(next)}`;
}

function label(seconds: number): string {
  return REFRESH_CHOICES.find((choice) => choice.seconds === seconds)?.label ?? `${seconds}s`;
}

// The line under a chart says how much of the source it is showing, how the measure was reduced, what
// was done to the data before anything was drawn, and when it was read. A bar whose height is a sum
// reads as a raw value to anyone not told otherwise, and a chart showing five of twelve regions with
// nothing saying so is a chart lying by omission.
export function caption(chart: VisualizationChart): string {
  const table = chart.table;
  const rows = table.truncated ? `showing ${table.rows.length} of ${table.total} rows` : `${table.rows.length} rows`;
  // The reduction is worded once, in `describe.ts`, and both the caption and the chart's own spoken
  // description use it: a bar whose height is a 95th percentile reads as a raw value to anyone not told
  // otherwise, and it reads that way whichever of the two lines they happen to look at.
  const how = `${reduction(chart)}${chart.y}`;
  // A chart of months says so on its face, and the words are here rather than in the transformation notes
  // because a time unit is not a transformation: nothing was done to the data except to say which day each
  // row belongs to.
  const unit = chart.xUnit === undefined ? '' : `by ${chart.xUnit}`;
  // A share of each band read as an absolute total is a chart saying the wrong thing, and the caption is
  // the only place that can say which of the two it is.
  // A measure the user named. Two charts can be drawn identically and mean different things when one of them
  // is the p95 and the other a mean of the same column, and the caption is the only place that says which.
  const metric = chart.metric ?? '';
  const stack = chart.stack === undefined
    ? ''
    : chart.stack === 'normalize' ? 'as a share of each category' : 'stacked';
  // A chart drawn from a file the agent acquired is not a live feed, and says so — otherwise a picture
  // that stopped an hour ago reads exactly like one that stopped a second ago.
  const from = chart.data.kind === 'file' ? `from ${chart.data.path}, acquired by the agent` : '';
  const when = chart.readAt === undefined ? '' : `read ${new Date(chart.readAt).toLocaleTimeString()}`;
  return [rows, how, unit, stack, metric, ...chart.notes, from, when].filter((part) => part !== '').join(' · ');
}
