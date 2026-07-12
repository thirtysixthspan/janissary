import { messageBus } from './bus.js';
import type { Managers } from './managers.js';
import type { MonitorSub } from './monitor-manager.js';
import { spawnMonitorSession } from './monitor-acp.js';
import { SUGGESTION_FORMAT } from './monitor-parsing.js';
import { formatConnection, personaSummary } from './monitor-info.js';

export function openMonitorSession(
  reg: MonitorSub,
  managers: Managers,
  spawn: typeof spawnMonitorSession = spawnMonitorSession,
): void {
  reg.inFlight = true;
  reg.session = spawn(reg.persona, managers.tab.cwdOf(reg.owner) ?? process.cwd(), {
    onError: (message) => managers.tab.append(reg.owner, { input: '', output: `monitor ${reg.persona.name}: ${message}` }),
    onConnect: (info) => {
      reg.info = info;
      const connection = formatConnection(info);
      const summary = personaSummary(reg.persona);
      managers.tab.append(reg.owner, {
        input: '',
        output: `monitor ${reg.persona.name}: connected${connection ? ` (${connection})` : ''} — ${summary}`,
      });
      messageBus.emit('state', { type: 'dirty' });
    },
  });
  const primingText = `${reg.persona.body}\n\n${SUGGESTION_FORMAT}`;
  reg.contextBytes += Buffer.byteLength(primingText, 'utf8');
  reg.session.prompt(primingText, {
    onChunk: () => {},
    onEnd: () => { reg.inFlight = false; },
    onError: () => { reg.inFlight = false; },
  });
}

export function respawnMonitorSession(
  reg: MonitorSub,
  managers: Managers,
  spawn: typeof spawnMonitorSession = spawnMonitorSession,
): void {
  reg.session.kill();
  // A fresh session starts a fresh context.
  reg.contextBytes = 0;
  openMonitorSession(reg, managers, spawn);
}
