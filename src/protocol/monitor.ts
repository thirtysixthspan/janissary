// Monitor-domain wire types and RPCs, composed into the shared contract by ../protocol.ts.

// One AI-monitor suggestion in the monitor window's feed: which persona produced it, which
// tab's activity it is about, and the optional one-click command.
export type SuggestionView = {
  id: string;
  text: string;
  command?: string;
  timestamp: number;
  persona: string;
  about: string;
};

export type MonitorRpcCall =
  // Run a monitor suggestion's command in the tab the suggestion is about. The
  // suggestion stays in the feed.
  | { method: 'runSuggestion'; params: { id: string } }
  // Rate a suggestion 👍/👎; feedback reaches the monitoring AI on its next batch and
  // the suggestion is removed from the feed (either direction).
  | { method: 'rateSuggestion'; params: { id: string; up: boolean } }
  // Reset a monitor's reporting tab to just its persona context (discards accumulated
  // conversation on its dedicated ACP session).
  | { method: 'resetMonitorContext'; params: { name: string } }
  // Open a point-in-time snapshot of a monitor's accumulated ACP context in an editor tab.
  | { method: 'monitorContextSnapshot'; params: { name: string } };
