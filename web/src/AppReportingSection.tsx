import type { ReportingEntry } from './ReportingSection';
import { ReportingSection } from './ReportingSection';
import type { JanusClient } from './ws';

export function AppReportingSection({
  entries, client, onClose, heightPct, onHeightPctChange,
}: {
  entries: ReportingEntry[];
  client: JanusClient;
  onClose: (index: number) => void;
  heightPct: number;
  onHeightPctChange: (heightPct: number) => void;
}) {
  return (
    <ReportingSection
      entries={entries}
      onClose={onClose}
      onRename={(index, title) => client.renameTab(index, title)}
      onReorder={(from, to) => client.send({
        method: 'reorderTabTo',
        params: { from: entries[from].index, to: entries[to].index },
      })}
      onRun={(id) => client.send({ method: 'runSuggestion', params: { id } })}
      onRate={(id, up) => client.send({ method: 'rateSuggestion', params: { id, up } })}
      onReset={(name) => client.send({ method: 'resetMonitorContext', params: { name } })}
      onSnapshot={(name) => client.send({ method: 'monitorContextSnapshot', params: { name } })}
      heightPct={heightPct}
      onHeightPctChange={onHeightPctChange}
    />
  );
}
