import React from 'react';
import { needsLegend } from './Axes';
import { CartesianChart } from './CartesianChart';
import { PieChart, pieLegend } from './PieChart';
import { marksFor, scatterFor, type ChartShape, type Table } from './points';
import { describeChart } from './describe';

// The frame the other two charts sit in, and the only place that knows what a chart specification is.
// It computes the marks once, decides which component draws them, and lays out the title, the legend,
// and the empty message. Every decision below this line is arithmetic or markup, never a choice about
// what should be shown.

const WIDTH = 720;
const HEIGHT = 420;
const MARGIN = { top: 40, right: 24, bottom: 56, left: 56 };
const BOX = {
  left: MARGIN.left,
  top: MARGIN.top,
  width: WIDTH - MARGIN.left - MARGIN.right,
  height: HEIGHT - MARGIN.top - MARGIN.bottom,
};

export type ChartProperties = {
  chart: ChartShape;
  table: Table;
};

const SERIES_COLOURS = [
  'var(--accent)', 'var(--success)', 'var(--running)', 'var(--error)', 'var(--muted)',
];

// The ref is forwarded because export rasterizes this element, and a rasterizer that cannot reach the
// element it is meant to be rasterizing has nothing to work from.
export const ChartSvg = React.forwardRef<SVGSVGElement, ChartProperties>(function ChartSvg(
  { chart, table }, ref,
) {
  const marks = marksFor(table, chart);
  const pie = chart.kind === 'pie';
  const empty = marks.points.length === 0 && marks.slices.length === 0;
  const series = pie ? pieLegend(marks.slices) : marks.series.map((name, index) => ({
    label: name || 'value',
    colour: SERIES_COLOURS[index % SERIES_COLOURS.length] ?? 'var(--accent)',
  }));
  // Two elements and two ids, because a bare <title> is announced inconsistently across screen readers:
  // the explicit label is what names the element, and the <title> is what the element is. Labelling the
  // root with the title alone is what told a screen reader the chart's name and none of its content.
  const titleId = React.useId();
  const descriptionId = React.useId();
  return (
    <svg
      ref={ref}
      className="visualization-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      // The export path rasterizes this element, and an explicit size is what makes a rasterized chart
      // come out at the resolution it was asked for rather than at the size it happened to be shown at.
      width={WIDTH}
      height={HEIGHT}
    >
      <title id={titleId}>{chart.title}</title>
      <desc id={descriptionId}>{describeChart(table, chart)}</desc>
      <text className="visualization-chart-title" x={MARGIN.left} y={22}>{chart.title}</text>
      {empty ? (
        <text
          className="visualization-chart-empty"
          x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle"
        >
          Nothing to plot
        </text>
      ) : pie ? (
        <PieChart box={BOX} slices={marks.slices} />
      ) : (
        <CartesianChart
          box={BOX}
          chart={chart}
          marks={marks}
          {...(chart.kind === 'scatter' && { scatter: scatterFor(table, chart) })}
        />
      )}
      {needsLegend(marks.series) || (pie && marks.slices.length > 0)
        ? series.map((entry, index) => (
          <g key={entry.label} transform={`translate(${MARGIN.left} ${HEIGHT - 16 - (series.length - 1 - index) * 14})`}>
            <rect width={10} height={10} y={-8} fill={entry.colour} />
            <text className="visualization-chart-legend" x={16} style={{ fill: 'var(--muted)', fontSize: 11 }}>
              {entry.label}
            </text>
          </g>
        ))
        : null}
    </svg>
  );
});
