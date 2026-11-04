import type { ConnectionView } from '../protocol.js';
import { closeConnection } from './close.js';
import { connectionCatalog } from './catalog.js';
import type { Managers } from '../managers.js';
import type { ConnectionKind } from './types.js';
import { listCompletionConnections } from './list.js';
import { notify } from '../notifications/index.js';
import { errorFirstLine } from '../error-text.js';

const CLOSED_PREFIX = 'Closed connection ';

export class ConnectionManager {
  constructor(private managers: Managers) {}

  // The connections panel: the catalog entries the tab itself holds. A remote tab lists its
  // transport alongside its processes, since the ssh session it runs over is a connection in its own
  // right and closing it closes the tab.
  connectionsFor(label: string): ConnectionView[] {
    const rows = connectionCatalog(this.managers, label)
      .filter((e) => e.scope === 'tab')
      .map((e) => (e.acpRef ? { text: e.display, kind: e.kind, acpRef: e.acpRef } : { text: e.display, kind: e.kind }));
    return [...rows, ...this.activeAgentRows(label)];
  }

  // A run the caller started is one of the caller's own connections while it is live. It has a
  // durable record to open, but no `acpRef`: the snapshot RPC has no agent-run scope.
  private activeAgentRows(label: string): ConnectionView[] {
    const rows: ConnectionView[] = [];
    for (const run of this.managers.agent.runs.values()) {
      if (run.outcome !== undefined || run.caller.label !== label) continue;
      const recordId = run.recordId;
      if (recordId === undefined) continue;
      rows.push({ text: `Agent: ${run.view().task}`, kind: 'acp', recordId });
    }
    return rows;
  }

  async closeTarget(kind: ConnectionKind, id: string, label: string): Promise<void> {
    const report = (text: string) => { this.reportClose(label, text); };
    try {
      if (kind === 'browser') {
        report(await this.managers.browser.run(label, `browser window close ${id}`));
      } else {
        closeConnection(kind, id, this.managers, label, report);
      }
    } catch (error) {
      this.reportCloseFailure(kind, id, label, error);
    }
  }

  completionConnections(label: string): string[] {
    return listCompletionConnections(this.managers, label);
  }

  private reportCloseFailure(kind: ConnectionKind, id: string, label: string, error: unknown): void {
    notify(this.managers, 'connection-close-failed', label, `Could not close connection ${kind}:${id}: ${errorFirstLine(error)}.`);
  }

  private reportClose(label: string, text: string): void {
    const event = text.startsWith(CLOSED_PREFIX) ? 'connection-closed' : 'connection-close-failed';
    notify(this.managers, event, label, text);
  }
}
