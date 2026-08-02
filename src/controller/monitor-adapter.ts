import { runSuggestion } from '../monitor/window.js';
import type { Managers } from '../managers.js';

export type MonitorControllerAdapter = {
  runSuggestion(id: string): void;
  rateSuggestion(id: string, up: boolean): void;
  resetMonitorContext(name: string): void;
  monitorContextSnapshot(name: string): void;
};

export function createMonitorControllerAdapter(managers: Managers): MonitorControllerAdapter {
  return {
    runSuggestion: (id) => runSuggestion(managers, id),
    rateSuggestion: (id, up) => managers.monitor.rate(id, up),
    resetMonitorContext: (name) => managers.monitor.resetContext(name),
    monitorContextSnapshot: (name) => managers.monitor.snapshotContext(name),
  };
}
