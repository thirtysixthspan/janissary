import { describe, expect, it } from 'vitest';
import type {
  VisualizationChartView as WireChart,
  VisualizationWindow as WireWindow,
  VisualizationsView as WireView,
} from '../../protocol.js';
import { TAB_PLUGIN_API_VERSION } from '../api.js';
import { tabPluginCatalog } from '../catalog.js';
import { visualizationsManifest } from './manifest.js';
import {
  isVisualizationsData,
  isVisualizationsPayload,
  VISUALIZATIONS_PAYLOAD_SCHEMA_VERSION,
  type VisualizationChart,
  type VisualizationWindow,
} from './shared.js';

const CHART: VisualizationChart = {
  id: 'c1',
  data: { kind: 'source' },
  notes: ['only year eq \'2024\''],
  refreshSeconds: 0,
  table: {
    columns: [{ name: 'region', type: 'string' }, { name: 'revenue', type: 'number' }],
    rows: [['north', 10]],
    total: 1,
    truncated: false,
  },
  kind: 'bar',
  x: 'region',
  y: 'revenue',
  title: 'Revenue',
};

const WINDOW: VisualizationWindow = {
  id: 'one',
  title: 'Revenue',
  source: 'https://example.com/d.csv',
  pair: { harness: 'opencode', model: 'model' },
  charts: [CHART],
  turns: [],
};

// The shared contract has to stay import-free, so its window shape is re-declared rather than imported
// from the wire type the topic actually delivers. These assignments are the pin that keeps the copy
// honest: either shape gaining or losing a field fails to compile here.
const asWireChart: WireChart = CHART;
const asPluginChart: VisualizationChart = asWireChart;
const asWireWindow: WireWindow = WINDOW;
const asPluginWindow: VisualizationWindow = asWireWindow;
const asWireView: WireView = { summaries: [], windows: [asWireWindow], models: [] };

describe('visualizations shared contract', () => {
  it('re-declares the window and the chart exactly', () => {
    expect(asPluginChart).toEqual(CHART);
    expect(asPluginWindow).toEqual(WINDOW);
    expect(asWireView.windows).toEqual([WINDOW]);
  });

  it('accepts both payload kinds', () => {
    expect(isVisualizationsPayload({ kind: 'list', entries: [] })).toBe(true);
    expect(isVisualizationsPayload({ kind: 'visualization', window: WINDOW, models: [] })).toBe(true);
  });

  it('refuses anything else, including a missing kind and a missing window', () => {
    expect(isVisualizationsPayload(null)).toBe(false);
    expect(isVisualizationsPayload([])).toBe(false);
    expect(isVisualizationsPayload({})).toBe(false);
    expect(isVisualizationsPayload({ kind: 'other', entries: [] })).toBe(false);
    expect(isVisualizationsPayload({ kind: 'visualization', models: [] })).toBe(false);
  });

  it('refuses a window missing any required field', () => {
    for (const field of Object.keys(WINDOW)) {
      const partial: Record<string, unknown> = { ...WINDOW };
      delete partial[field];
      expect(isVisualizationsPayload({ kind: 'visualization', window: partial, models: [] })).toBe(false);
    }
  });

  it('refuses a chart missing any required field', () => {
    for (const field of Object.keys(CHART)) {
      const partial: Record<string, unknown> = { ...CHART };
      delete partial[field];
      expect(isVisualizationsPayload({ kind: 'visualization', window: { ...WINDOW, charts: [partial] }, models: [] }))
        .toBe(false);
    }
  });

  it('accepts every optional field a tab can be showing', () => {
    expect(isVisualizationsPayload({
      kind: 'visualization',
      window: {
        ...WINDOW,
        deleted: true,
        busy: true,
        error: 'boom',
        followUps: ['make it a line chart'],
        turns: [{ query: 'q', response: 'a', pair: { harness: 'claude', model: 'm' } }],
        charts: [{
          ...CHART,
          data: { kind: 'file', path: 'data.json' },
          readAt: 5,
          error: 'returned 500',
          refreshSeconds: 30,
          series: 'region',
          aggregate: 'sum',
          xLabel: 'Region',
          yLabel: 'Revenue',
          notes: [],
        }],
      },
      models: [{ harness: 'claude', model: 'm' }],
    })).toBe(true);
  });

  it('refuses a chart kind it does not draw, a data reference it does not know, and a turn marked streaming', () => {
    expect(isVisualizationsPayload({
      kind: 'visualization',
      window: { ...WINDOW, charts: [{ ...CHART, kind: 'radar' as never }] },
      models: [],
    })).toBe(false);
    expect(isVisualizationsPayload({
      kind: 'visualization',
      window: { ...WINDOW, charts: [{ ...CHART, data: { kind: 'url' } as never }] },
      models: [],
    })).toBe(false);
    expect(isVisualizationsData({
      summaries: [],
      models: [],
      windows: [{
        ...WINDOW,
        turns: [{ query: 'q', response: '', pair: { harness: 'claude', model: 'm' }, streaming: true }],
      }],
    })).toBe(false);
  });

  // The transformations do not reach the browser — the caption arrives as words instead — so the guard
  // that mattered most is the one for what the chart carries in their place.
  it('refuses a chart whose notes are not strings', () => {
    expect(isVisualizationsPayload({
      kind: 'visualization',
      window: { ...WINDOW, charts: [{ ...CHART, notes: [42 as never] }] },
      models: [],
    })).toBe(false);
  });
});

describe('visualizations manifest', () => {
  it('pins its payload schema version to the contract\'s own constant', () => {
    expect(visualizationsManifest.payloadSchemaVersion).toBe(VISUALIZATIONS_PAYLOAD_SCHEMA_VERSION);
    expect(visualizationsManifest.apiVersion).toBe(TAB_PLUGIN_API_VERSION);
  });

  it('claims the visualizations command, the topic, no files, and a default-menu entry', () => {
    expect(visualizationsManifest.command).toBe('visualizations');
    expect(visualizationsManifest.notifications).toEqual(['visualizations']);
    expect(visualizationsManifest.fileExtensions).toEqual({});
    expect(visualizationsManifest.defaultMenu?.label).toBe('Visualize this');
  });

  it('is in the production catalog', () => {
    expect(tabPluginCatalog.map((entry) => entry.id)).toContain('visualizations');
  });

  // A declaration naming a topic must supply `notify`, and asking for a capability it does not
  // declare disables the plugin — so the declared set is exactly what `activate` uses.
  it('declares every capability its activation uses and nothing more', () => {
    expect([...visualizationsManifest.capabilities].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'dockTab', 'openOrFocusTab', 'rejectRequest', 'reportFailure', 'topicAction', 'topicData',
      'updateTab',
    ]);
  });
});
