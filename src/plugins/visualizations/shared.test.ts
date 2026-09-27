import { describe, expect, it } from 'vitest';
import type {
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
  type VisualizationWindow,
} from './shared.js';

const WINDOW: VisualizationWindow = {
  id: 'one',
  title: 'Revenue',
  source: 'https://example.com/d.csv',
  pair: { harness: 'opencode', model: 'model' },
  refreshSeconds: 0,
  questions: [],
  turns: [],
};

// The shared contract has to stay import-free, so its window shape is re-declared rather than imported
// from the wire type the topic actually delivers. These two assignments are the pin that keeps the
// copy honest: either shape gaining or losing a field fails to compile here.
const asWireWindow: WireWindow = WINDOW;
const asPluginWindow: VisualizationWindow = asWireWindow;
const asWireView: WireView = { summaries: [], windows: [asWireWindow], models: [] };

describe('visualizations shared contract', () => {
  it('re-declares the window exactly', () => {
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

  it('accepts every optional field a tab can be showing', () => {
    expect(isVisualizationsPayload({
      kind: 'visualization',
      window: {
        ...WINDOW,
        readAt: 5,
        pendingQuestionId: 'q1',
        questions: [{ id: 'q1', question: 'Q?', suggestions: ['a'], answer: 'a' }],
        chart: { kind: 'pie', x: 'region', y: 'revenue', title: 'T' },
        table: { columns: [{ name: 'a', type: 'number' }], rows: [[1]], total: 1, truncated: false },
        busy: true,
        error: 'boom',
        deleted: true,
      },
      models: [{ harness: 'claude', model: 'm' }],
    })).toBe(true);
  });

  it('refuses a chart kind it does not draw, and a turn marked streaming', () => {
    expect(isVisualizationsPayload({
      kind: 'visualization',
      window: { ...WINDOW, chart: { kind: 'radar', x: 'a', y: 'b', title: 'T' } },
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
