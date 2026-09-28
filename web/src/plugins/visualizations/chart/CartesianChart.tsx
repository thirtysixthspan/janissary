import React from 'react';
import { Axes } from './Axes';
import { markLabel, measureName, reduction } from './describe';
import { calendarLabel } from './time';
import { extentOf, type ChartShape, type Marks, type ScatterPoint } from './points';
import { band, linear, seriesOffset, type Box, type Linear } from './scale';

// The one component that draws every mark kind sharing a rectangular frame: a bar, a line, an area, and
// a scatter. They differ in the element emitted per point and in whether the x axis is a band or a second
// measure, so splitting them into four components would duplicate the frame, the y scale, and the point
// list four times over.
//
// Nothing here reads the table or chooses a domain it could have been handed: `marks` arrive with the
// arithmetic already done, which is what keeps this file about drawing.

// The series ramp. Named here rather than in the stylesheet, because these are the only colours a chart
// paints with and the export resolves the same list; a ramp that survived colour-vision deficiency belongs
// in this file until it can be measured against every theme — see the backlog entry that tracks it.
const SERIES_COLOURS = [
  'var(--accent)', 'var(--success)', 'var(--running)', 'var(--error)', 'var(--muted)',
];

function colour(index: number): string {
  return SERIES_COLOURS[Math.max(index, 0) % SERIES_COLOURS.length] ?? 'var(--accent)';
}

export type CartesianProperties = {
  box: Box;
  chart: ChartShape;
  marks: Marks;
  // Only a scatter needs these: its x column is a measure, so its points come from the numeric read
  // rather than from the banded one every other kind draws.
  scatter?: ScatterPoint[];
};

type Prepared = {
  y: Linear;
  base: number;
  bands: ReturnType<typeof band>;
  xNumeric?: Linear;
  stacked: boolean;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function prepare({ box, chart, marks, scatter }: CartesianProperties): Prepared {
  const y = linear(box, extentOf(marks.points.map((point) => point.value), marks.points.map((point) => point.from)));
  return {
    y,
    // The baseline is where zero falls, which is not the bottom of the plot when a measure runs
    // entirely below it. Bars grow from there, not from the axis, so a bar's length always means what
    // its value means.
    base: Math.min(Math.max(y.at(0), box.top), box.top + box.height),
    bands: band(box, Math.max(...marks.points.map((point) => point.band), 0) + 1),
    stacked: chart.stack !== undefined,
    ...(chart.kind === 'scatter' && {
      xNumeric: linear(box, extentOf((scatter ?? []).map((point) => point.x))),
    }),
  };
}

// A stacked segment runs from the top of the one below it to its own top, and an unstacked one runs from
// the axis. One case rather than two, because the mark already carries both ends.
function bars(chart: ChartShape, marks: Marks, prepared: Prepared): React.ReactElement[] {
  return marks.points.map((point) => {
    const index = prepared.bands.count === 0 ? 0 : marks.series.indexOf(point.series);
    const bottom = Math.min(prepared.y.at(point.from), prepared.y.at(point.value));
    const top = Math.max(prepared.y.at(point.from), prepared.y.at(point.value));
    // A stacked chart gives every series the whole band rather than a slot within it: a segment is a
    // slice of the band, and a slice with gaps in it is a slice of a smaller bar than the chart says.
    const slot = prepared.stacked
      ? { left: 0, width: prepared.bands.width }
      : seriesOffset(Math.max(index, 0), marks.series.length, prepared.bands.width);
    return (
      <rect
        key={`${point.band}-${point.series}`}
        // The name of the mark, built from the same values it is drawn from: a bar announced with a
        // different number than the one on screen is worse than a bar not announced at all.
        aria-label={markLabel(chart, point)}
        x={round(prepared.bands.at(point.band) + slot.left)}
        y={round(bottom)}
        width={round(slot.width)}
        height={round(Math.max(top - bottom, 1))}
        fill={colour(index)}
      />
    );
  });
}

function linePath(marks: Marks, prepared: Prepared, series: string): string {
  return marks.points
    .filter((point) => point.series === series)
    .map((point, index) => {
      const x = prepared.bands.at(point.band) + prepared.bands.width / 2;
      return `${index === 0 ? 'M' : 'L'}${round(x)} ${round(prepared.y.at(point.value))}`;
    })
    .join(' ');
}

function areaPath(marks: Marks, prepared: Prepared, series: string): string {
  const own = marks.points.filter((point) => point.series === series);
  const first = own[0];
  const last = own.at(-1);
  if (!first || !last) return '';
  const left = prepared.bands.at(first.band) + prepared.bands.width / 2;
  const right = prepared.bands.at(last.band) + prepared.bands.width / 2;
  return `${linePath(marks, prepared, series)} L${round(right)} ${round(prepared.base)} L${round(left)} ${round(prepared.base)} Z`;
}

function dotsFor(chart: ChartShape, scatter: readonly ScatterPoint[], prepared: Prepared): React.ReactElement[] {
  const x = prepared.xNumeric;
  if (!x) return [];
  return scatter.map((point, index) => (
    <circle
      key={index}
      aria-label={markLabel(chart, { label: String(point.x), value: point.y })}
      cx={round(x.at(point.x))} cy={round(prepared.y.at(point.y))} r={2} fill={colour(0)}
    />
  ));
}

// A date x column carries the unit the host bucketed it by, and the tick says that unit rather than the
// ISO date it was stored as.
function labelsFor(chart: ChartShape, marks: Marks): string[] {
  const labels = marks.points.map((point) => point.label);
  const unit = chart.xUnit;
  return unit === undefined ? labels : labels.map((label) => calendarLabel(label, unit));
}

export function CartesianChart(properties: CartesianProperties): React.ReactElement {
  const { box, chart, marks } = properties;
  const prepared = prepare(properties);
  const isScatter = chart.kind === 'scatter';
  return (
    <g>
      <Axes
        box={box}
        y={prepared.y}
        categoryLabels={labelsFor(chart, marks)}
        {...(isScatter ? { xNumeric: prepared.xNumeric } : { x: prepared.bands })}
        {...(chart.xLabel !== undefined && { xLabel: chart.xLabel })}
        {...(chart.yLabel !== undefined && { yLabel: chart.yLabel })}
      />
      {chart.kind === 'bar' ? bars(chart, marks, prepared) : null}
      {chart.kind === 'line' || chart.kind === 'area'
        ? marks.series.map((series, index) => (
          <g key={series || 'single'} aria-label={`${series || 'every category'}, ${reduction(chart)}${measureName(chart)}`}>
            {chart.kind === 'area' ? (
              <path d={areaPath(marks, prepared, series)} fill={colour(index)} opacity={0.25} />
            ) : null}
            <path d={linePath(marks, prepared, series)} fill="none" stroke={colour(index)} strokeWidth={1.5} />
          </g>
        ))
        : null}
      {isScatter ? dotsFor(chart, properties.scatter ?? [], prepared) : null}
    </g>
  );
}
