import React from 'react';
import type { Band, Linear } from './scale';
import { SINGLE_SERIES } from './points';

// The axes, drawn from scales that have already decided every value. Nothing here reads the table or
// chooses a domain: a component that computed a scale would be a component whose arithmetic could only
// be tested through a render.
export type AxisProperties = {
  box: { left: number; top: number; width: number; height: number };
  y: Linear;
  // A category axis is a band per row; a scatter's is a second linear scale, because there the x column
  // is a measure and a point belongs where its value puts it rather than in an evenly spaced slot.
  x?: Band;
  xNumeric?: Linear;
  categoryLabels?: string[];
  xLabel?: string;
  yLabel?: string;
};

const TICK_STYLE = { fill: 'var(--muted)', fontSize: 10 } as const;

function formatTick(value: number): string {
  if (Number.isSafeInteger(value)) return String(value);
  // A fractional tick with more places than a reader can hold is noise, so a fixed two and trailing
  // zeros stripped is enough for any span this draws.
  return value.toFixed(2).replace(/\.?0+$/u, '');
}

function YAxis({ box, y, yLabel }: AxisProperties): React.ReactElement {
  return (
    <g>
      <line x1={box.left} y1={box.top} x2={box.left} y2={box.top + box.height} stroke="var(--border)" />
      {y.ticks.map((tick) => (
        <text key={tick} x={box.left - 6} y={y.at(tick) + 3} textAnchor="end" style={TICK_STYLE}>
          {formatTick(tick)}
        </text>
      ))}
      {yLabel === undefined ? null : (
        <text
          x={box.left - 34} y={box.top + box.height / 2} textAnchor="middle"
          transform={`rotate(-90 ${box.left - 34} ${box.top + box.height / 2})`}
          style={TICK_STYLE}
        >
          {yLabel}
        </text>
      )}
    </g>
  );
}

function CategoryAxis({ box, x, categoryLabels, xLabel }: AxisProperties): React.ReactElement | null {
  if (!x) return null;
  // More categories than there is room to label is the normal case for a wide table, so labels thin to
  // a stride rather than overlapping into an unreadable band of text.
  const stride = Math.max(Math.ceil(x.count / Math.max(Math.floor(x.width / 56), 1)), 1);
  return (
    <g>
      <line
        x1={box.left} y1={box.top + box.height} x2={box.left + box.width} y2={box.top + box.height}
        stroke="var(--border)"
      />
      {Array.from({ length: x.count }, (_, index) => (
        <text
          key={index}
          x={x.at(index) + x.width / 2}
          y={box.top + box.height + 14}
          textAnchor="middle"
          style={TICK_STYLE}
        >
          {index % stride === 0 ? (categoryLabels?.[index] ?? String(index)) : ''}
        </text>
      ))}
      {xLabel === undefined ? null : (
        <text x={box.left + box.width / 2} y={box.top + box.height + 30} textAnchor="middle" style={TICK_STYLE}>
          {xLabel}
        </text>
      )}
    </g>
  );
}

function NumericXAxis({ box, xNumeric, xLabel }: AxisProperties): React.ReactElement | null {
  if (!xNumeric) return null;
  return (
    <g>
      <line
        x1={box.left} y1={box.top + box.height} x2={box.left + box.width} y2={box.top + box.height}
        stroke="var(--border)"
      />
      {xNumeric.ticks.map((tick) => (
        <text
          key={tick} x={xNumeric.at(tick)} y={box.top + box.height + 14} textAnchor="middle"
          style={TICK_STYLE}
        >
          {formatTick(tick)}
        </text>
      ))}
      {xLabel === undefined ? null : (
        <text x={box.left + box.width / 2} y={box.top + box.height + 30} textAnchor="middle" style={TICK_STYLE}>
          {xLabel}
        </text>
      )}
    </g>
  );
}

export function Axes(properties: AxisProperties): React.ReactElement {
  return (
    <g>
      <YAxis {...properties} />
      <CategoryAxis {...properties} />
      <NumericXAxis {...properties} />
    </g>
  );
}

export function needsLegend(series: readonly string[]): boolean {
  return series.length > 1 && series[0] !== SINGLE_SERIES;
}
