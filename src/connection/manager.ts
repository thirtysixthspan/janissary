import type { ConnectionView } from '../protocol.js';
import { parseConnectionCommand } from './parsing.js';
import { closeConnection } from './close.js';
import { connectionCatalog } from './catalog.js';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { ConnectionKind } from './types.js';
import { listLines, listCompletionConnections } from './list.js';
import { appendCommandOutput } from '../command/append.js';
import { notify } from '../notifications/index.js';
import { errorFirstLine } from '../error-text.js';

const CLOSED_PREFIX = 'Closed connection ';

export class ConnectionManager {
  constructor(private managers: Managers) {}

  // The connections panel: the catalog entries the tab itself holds. A remote tab lists its
  // transport alongside its processes, since the ssh session it runs over is a connection in its own
  // right and closing it closes the tab.
  connectionsFor(label: string): ConnectionView[] {
    return connectionCatalog(this.managers, label)
      .filter((e) => e.scope === 'tab')
      .map((e) => (e.acpRef ? { text: e.display, kind: e.kind, acpRef: e.acpRef } : { text: e.display, kind: e.kind }));
  }

  // Listing and usage errors are written through the invocation, so a shell tab's capture prints
  // them. A close reports its outcome as a notification instead.
  async run(command: string, label: string, invocation?: CommandInvocationContext): Promise<void> {
    const parsed = parseConnectionCommand(command);
    const out = (text: string) => { appendCommandOutput(this.managers, label, { input: command, output: text }, invocation); };
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') {
      const lines = listLines(this.managers, label);
      out(lines.length > 0 ? lines.join('\n') : 'No open connections.');
      return;
    }
    const report = (text: string) => { this.reportClose(label, text); };
    try {
      await this.close(parsed.kind, parsed.id, label, report);
    } catch (error) {
      notify(this.managers, 'connection-close-failed', label, `Could not close connection ${parsed.kind}:${parsed.id}: ${errorFirstLine(error)}.`);
    }
  }

  completionConnections(label: string): string[] {
    return listCompletionConnections(this.managers, label);
  }

  private async close(kind: ConnectionKind, id: string, label: string, report: (text: string) => void): Promise<void> {
    if (kind === 'browser') {
      report(await this.managers.browser.run(label, `browser window close ${id}`));
      return;
    }
    closeConnection(kind, id, this.managers, label, report);
  }

  private reportClose(label: string, text: string): void {
    const event = text.startsWith(CLOSED_PREFIX) ? 'connection-closed' : 'connection-close-failed';
    notify(this.managers, event, label, text);
  }
}
