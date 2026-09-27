import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate, faFileArrowDown, faFilePdf } from '@fortawesome/free-solid-svg-icons';
import type { VisualizationTabPayload } from '@shared/plugins/visualizations/shared';
import { InlineEditInput, type TabPluginClientCapabilities } from '../api';
import { VisualizationBody } from './VisualizationBody';
import { exportPdf, exportPng } from './export/download';

// The intervals offered, in the order they appear. Zero is first because it is the default, and because
// "keep this current" is a decision rather than an expectation: nothing should start polling a remote URL
// because someone made a chart out of it.
export const REFRESH_CHOICES: readonly { label: string; seconds: number }[] = [
  { label: 'off', seconds: 0 },
  { label: '10s', seconds: 10 },
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
];

export type TabProperties = {
  payload: VisualizationTabPayload;
  capabilities: TabPluginClientCapabilities;
};

export function VisualizationTab({ payload, capabilities }: TabProperties) {
  const { window: view, models } = payload;
  // The chart element itself, because export rasterizes what is on screen rather than redrawing it.
  const chartRef = useRef<SVGSVGElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(view.title);
  const [exportFailure, setExportFailure] = useState('');
  const inert = view.deleted === true;
  const busy = view.busy === true;

  const intent = (name: string, value: unknown) => { void capabilities.intent(name, value); };

  const exportChart = async (kind: 'png' | 'pdf') => {
    const svg = chartRef.current;
    if (!svg) return;
    try {
      const title = view.chart?.title ?? view.title;
      if (kind === 'png') await exportPng(svg, title);
      else await exportPdf(svg, title);
      setExportFailure('');
    } catch (error) {
      setExportFailure(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="visualization-tab plugin-tab">
      <div className="plugin-meta visualization-header">
        {renaming ? (
          <InlineEditInput
            className="visualization-title-input"
            value={draftTitle}
            maxLength={60}
            onChange={setDraftTitle}
            onCommit={() => {
              setRenaming(false);
              if (draftTitle.trim() !== view.title) intent('rename', { title: draftTitle });
            }}
            onCancel={() => { setRenaming(false); }}
          />
        ) : (
          <span className="plugin-name visualization-title" onDoubleClick={() => { if (!inert) setRenaming(true); }}>
            {view.title}
          </span>
        )}
        <span className="visualization-source" title={view.source}>{view.source}</span>
        <span className="plugin-actions">
          <select
            aria-label="Model"
            value={`${view.pair.harness}:${view.pair.model}`}
            disabled={inert || busy}
            onChange={(event) => {
              const separator = event.target.value.indexOf(':');
              const pair = models.find((entry) =>
                entry.harness === event.target.value.slice(0, separator)
                && entry.model === event.target.value.slice(separator + 1));
              if (pair) intent('select-model', pair);
            }}
          >
            {grouped(models).map(([harness, entries]) => (
              <optgroup key={harness} label={harness}>
                {entries.map((entry) => (
                  <option key={entry.model} value={`${entry.harness}:${entry.model}`}>{entry.model}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            aria-label="Refresh"
            value={String(view.refreshSeconds)}
            disabled={inert || busy}
            onChange={(event) => { intent('set-refresh', { seconds: Number(event.target.value) }); }}
          >
            {REFRESH_CHOICES.map((choice) => (
              <option key={choice.seconds} value={choice.seconds}>{choice.label}</option>
            ))}
          </select>
          <button type="button" title="Read the source now" disabled={inert || busy} onClick={() => { intent('refresh-now', {}); }}>
            <FontAwesomeIcon icon={faArrowsRotate} />
          </button>
          <button
            type="button" title="Export as PNG" disabled={inert || view.chart === undefined}
            onClick={() => { void exportChart('png'); }}
          >
            <FontAwesomeIcon icon={faFileArrowDown} />
          </button>
          <button
            type="button" title="Export as PDF" disabled={inert || view.chart === undefined}
            onClick={() => { void exportChart('pdf'); }}
          >
            <FontAwesomeIcon icon={faFilePdf} />
          </button>
          {capabilities.splitAction}
        </span>
      </div>
      {exportFailure === '' ? null : <p className="visualization-export-error">{exportFailure}</p>}
      <VisualizationBody
        view={view}
        busy={busy}
        active={capabilities.active}
        chartRef={chartRef}
        onAnswer={(questionId, answer) => { intent('answer', { questionId, answer }); }}
        onAskAgain={() => { intent('start-interview', {}); }}
        onRevise={(query) => { intent('revise', { query }); }}
        onCancel={() => { intent('cancel', {}); }}
        onSetSource={(source) => { intent('set-source', { source }); }}
      />
    </div>
  );
}

type Models = VisualizationTabPayload['models'];

// Grouped by harness because that is the axis a reader chooses on: the pair that answers a question is
// a harness and a model, and offering them as one flat list of pairs makes the harness invisible.
function grouped(models: Models): [string, Models][] {
  const byHarness = new Map<string, Models>();
  for (const entry of models) {
    byHarness.set(entry.harness, [...(byHarness.get(entry.harness) ?? []), entry]);
  }
  return [...byHarness];
}
