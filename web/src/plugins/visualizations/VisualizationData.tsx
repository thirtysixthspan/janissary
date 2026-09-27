import React from 'react';
import { dataTableFor, describeChart, type DataTable } from './chart/describe';
import type { ChartShape, Table } from './chart/points';
import type { ChartView } from './chart/view';

// The chart's text alternative: one sentence naming what is plotted, and the marks themselves as a table.
// A chart is a picture of a table, so the table is the alternative that cannot misdescribe it — it is
// generated from the same marks the renderer draws, and the sentence beside it is built from those same
// marks rather than written alongside them.

export type DataProperties = {
  chart: ChartShape;
  table: Table;
  view: ChartView;
};

export function VisualizationData({ chart, table, view }: DataProperties): React.ReactElement {
  const data = dataTableFor(table, chart, view);
  return (
    <details className="visualization-data">
      <summary>Data table</summary>
      <p className="visualization-data-summary">{describeChart(table, chart, view)}</p>
      <ChartTable data={data} />
    </details>
  );
}

function ChartTable({ data }: { data: DataTable }): React.ReactElement {
  if (data.rows.length === 0) return <p className="visualization-data-empty">No marks to list.</p>;
  return (
    <div className="visualization-data-scroll">
      <table>
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th key={column.name} scope="col" className={column.numeric ? 'is-numeric' : undefined}>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, index) => (
            // The marks carry no identity of their own, and two rows may well be identical, so the
            // position in the list is the only thing that can key them.
            <tr key={index}>
              {row.map((cell, cellIndex) => {
                const column = data.columns[cellIndex];
                return (
                  <td key={cellIndex} className={column?.numeric ? 'is-numeric' : undefined}>
                    {String(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
