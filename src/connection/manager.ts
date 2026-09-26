import type { ConnectionView } from '../protocol.js';
import { parseConnectionCommand } from './parsing.js';
import { closeConnection } from './close.js';
import { connectionCatalog } from './catalog.js';
import type { Managers } from '../managers.js';
import { listLines, listCompletionConnections } from './list.js';

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

  run(command: string, label: string): void {
    const parsed = parseConnectionCommand(command);
    const out = (text: string) => this.managers.tab.append(label, { input: command, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') {
      const lines = listLines(this.managers, label);
      out(lines.length > 0 ? lines.join('\n') : 'No open connections.');
      return;
    }
    if (parsed.kind === 'browser') {
      this.managers.tab.startRunning(label, command);
      void this.managers.browser.run(label, `browser window close ${parsed.id}`).then((o) => this.managers.tab.finishRunning(label, o, { command }));
      return;
    }
    closeConnection(parsed.kind, parsed.id, this.managers, label, out);
  }

  completionConnections(label: string): string[] {
    return listCompletionConnections(this.managers, label);
  }
}
