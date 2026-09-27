import React from 'react';
import type { PieSlice } from './points';
import type { Box } from './scale';

// A pie shares nothing with the rectangular charts: there is no axis to draw, no band to divide, and
// the only decision worth making is where each slice starts and ends. It gets its own component for
// that reason rather than because it is a sixth mark kind in the same frame.

const SLICE_COLOURS = [
  'var(--accent)', 'var(--success)', 'var(--running)', 'var(--error)', 'var(--muted)', 'var(--faint)',
];

function colour(index: number): string {
  return SLICE_COLOURS[index % SLICE_COLOURS.length] ?? 'var(--accent)';
}

function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [cx + (radius * Math.cos(angle)), cy + (radius * Math.sin(angle))];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// The sweep a slice covers, as a path. A slice that is the whole circle has no arc to draw, so it is
// emitted as a full disc instead — a single-category pie is an ordinary answer to a question someone
// will certainly ask.
function slicePath(cx: number, cy: number, radius: number, from: number, to: number): string {
  if (Math.PI * 2 - (to - from) <= 1e-6) return `M${round(cx - radius)} ${round(cy)} a${round(radius)} ${round(radius)} 0 1 0 ${round(radius * 2)} 0 a${round(radius)} ${round(radius)} 0 1 0 ${round(-radius * 2)} 0 Z`;
  const [startX, startY] = polar(cx, cy, radius, from);
  const [endX, endY] = polar(cx, cy, radius, to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${round(cx)} ${round(cy)} L${round(startX)} ${round(startY)} A${round(radius)} ${round(radius)} 0 ${large} 1 ${round(endX)} ${round(endY)} Z`;
}

export type PieProperties = {
  box: Box;
  slices: PieSlice[];
};

export function PieChart({ box, slices }: PieProperties): React.ReactElement {
  const values = slices.map((slice) => slice.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  // A pie of nothing, or of values that cancel out, has no angle to draw. A line saying so beats an
  // empty disc that looks like a chart.
  if (slices.length === 0 || Math.abs(total) === 0) {
    return <text x={box.left + box.width / 2} y={box.top + box.height / 2} textAnchor="middle" style={{ fill: 'var(--muted)' }}>Nothing to plot</text>;
  }
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const radius = Math.max(Math.min(box.width, box.height) / 2 - 8, 8);
  let angle = -Math.PI / 2;
  return (
    <g>
      {slices.map((slice, index) => {
        const sweep = (slice.value / total) * Math.PI * 2;
        const path = slicePath(cx, cy, radius, angle, angle + sweep);
        angle += sweep;
        return <path key={slice.label} d={path} fill={colour(index)} stroke="var(--bg)" strokeWidth={1} />;
      })}
      <desc>{`${slices.length} categories, total ${round(total)}`}</desc>
    </g>
  );
}

export function pieLegend(slices: readonly PieSlice[]): { label: string; colour: string }[] {
  return slices.map((slice, index) => ({ label: slice.label, colour: colour(index) }));
}
