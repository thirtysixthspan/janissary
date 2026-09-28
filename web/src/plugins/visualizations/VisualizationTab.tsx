import React from 'react';
import type { VisualizationTabPayload } from '@shared/plugins/visualizations/shared';
import { type TabPluginClientCapabilities } from '../api';
import { VisualizationChartCard } from './VisualizationChartCard';
import { VisualizationChat } from './VisualizationChat';

// A visualization is a conversation with a picture above it, and this file is the whole of the tab's
// chrome: a row carrying the name and the source as text, the charts, and the chat. There is no select
// element anywhere in it and no control that is not on a chart or in the chat, because the only thing
// that changes a chart is a sentence the user typed — including the name, which the model sets when
// they ask for it in words.

export type TabProperties = {
  payload: VisualizationTabPayload;
  capabilities: TabPluginClientCapabilities;
};

export function VisualizationTab({ payload, capabilities }: TabProperties) {
  const { window: view } = payload;
  const inert = view.deleted === true;
  const busy = view.busy === true;

  const intent = (name: string, value: unknown) => { void capabilities.intent(name, value); };

  return (
    <div className="visualization-tab plugin-tab">
      <div className="plugin-meta visualization-header">
        <span className="plugin-name visualization-title" title={view.source}>{view.title}</span>
        <span className="visualization-source" title={view.source}>{view.source}</span>
        <span className="plugin-actions">{capabilities.splitAction}</span>
      </div>
      {/* A record deleted from the index while its tab was open leaves that tab open and inert, which is
          the resolution `product/specs/conversations.md` records for the same situation — and the only
          reason to keep it open is that it can say so. */}
      {inert ? <p className="visualization-gone">This visualization was deleted.</p> : null}
      {view.charts.length === 0 ? null : (
        <div className="visualization-cards">
          {view.charts.map((chart) => (
            <VisualizationChartCard
              key={chart.id}
              chart={chart}
              busy={busy}
              disabled={inert}
              onSetRefresh={(chartId, seconds) => { intent('set-chart-refresh', { chartId, seconds }); }}
              onRefreshNow={(chartId) => { intent('refresh-chart', { chartId }); }}
            />
          ))}
        </div>
      )}
      <VisualizationChat
        turns={view.turns}
        notices={view.notices}
        instructions={view.instructions}
        {...(view.followUps !== undefined && { followUps: view.followUps })}
        {...(view.error !== undefined && { error: view.error })}
        prompted={view.source === '' && view.turns.length === 0}
        busy={busy}
        disabled={inert}
        active={capabilities.active}
        onSend={(query) => { intent('send', { query }); }}
        onCancel={() => { intent('cancel', {}); }}
      />
    </div>
  );
}
