import React from 'react';
import { Axes } from './Axes';
import { extentOf, type ChartShape, type Marks, type ScatterPoint } from './points';
import { band, linear, seriesOffset, type Box, type Linear } from './scale';

// The one component that draws every mark kind sharing a rectangular frame: a bar, a line, an area, and
// a scatter. They differ in the element emitted per point and in whether the x axis is a band or a second
// measure, so splitting them into four components would duplicate the frame, the y scale, and the point
// list four times over.
//
// Nothing here reads the table or chooses a domain it could have been handed: `marks` arrive with the
// arithmetic already done, which is what keeps this file about drawing.

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
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function prepare({ box, chart, marks, scatter }: CartesianProperties): Prepared {
  const y = linear(box, extentOf(marks.points.map((point) => point.value)));
  return {
    y,
    // The baseline is where zero falls, which is not the bottom of the plot when a measure runs
    // entirely below it. Bars grow from there, not from the axis, so a bar's length always means what
    // its value means.
    base: Math.min(Math.max(y.at(0), box.top), box.top + box.height),
    bands: band(box, Math.max(...marks.points.map((point) => point.band), 0) + 1),
    ...(chart.kind === 'scatter' && {
      xNumeric: linear(box, extentOf((scatter ?? []).map((point) => point.x))),
    }),
  };
}

function bars(marks: Marks, prepared: Prepared): React.ReactElement[] {
  return marks.points.map((point) => {
    const index = prepared.bands.count === 0 ? 0 : marks.series.indexOf(point.series);
    const slot = seriesOffset(Math.max(index, 0), marks.series.length, prepared.bands.width);
    return (
      <rect
        key={`${point.band}-${point.series}`}
        x={round(prepared.bands.at(point.band) + slot.left)}
        y={round(Math.min(prepared.y.at(point.value), prepared.base))}
        width={round(slot.width)}
        height={round(Math.max(Math.abs(prepared.y.at(point.value) - prepared.base), 1))}
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

function dots(scatter: readonly ScatterPoint[], prepared: Prepared): React.ReactElement[] {
  const x = prepared.xNumeric;
  if (!x) return [];
  return scatter.map((point, index) => (
    <circle key={index} cx={round(x.at(point.x))} cy={round(prepared.y.at(point.y))} r={2} fill={colour(0)} />
  ));
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
        categoryLabels={marks.points.map((point) => point.label)}
        {...(isScatter ? { xNumeric: prepared.xNumeric } : { x: prepared.bands })}
        {...(chart.xLabel !== undefined && { xLabel: chart.xLabel })}
        {...(chart.yLabel !== undefined && { yLabel: chart.yLabel })}
      />
      {chart.kind === 'bar' ? bars(marks, prepared) : null}
      {chart.kind === 'line' || chart.kind === 'area'
        ? marks.series.map((series, index) => (
          <g key={series || 'single'}>
            {chart.kind === 'area' ? (
              <path d={areaPath(marks, prepared, series)} fill={colour(index)} opacity={0.25} />
            ) : null}
            <path d={linePath(marks, prepared, series)} fill="none" stroke={colour(index)} strokeWidth={1.5} />
          </g>
        ))
        : null}
      {isScatter ? dots(properties.scatter ?? [], prepared) : null}
    </g>
  );
}
