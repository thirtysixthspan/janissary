import { messageBus } from './bus.js';
import type { Managers } from './managers.js';
import type { MonitorSub } from './monitor-manager.js';
import { spawnMonitorSession } from './monitor-acp.js';
import { SUGGESTION_FORMAT } from './monitor-parsing.js';

export function openMonitorSession(
  reg: MonitorSub,
  managers: Managers,
  spawn: typeof spawnMonitorSession = spawnMonitorSession,
): void {
  reg.inFlight = true;
  reg.session = spawn(reg.persona, managers.tab.cwdOf(reg.owner) ?? process.cwd(), {
    onError: (message) => managers.tab.append(reg.owner, { input: '', output: `monitor ${reg.persona.name}: ${message}` }),
    onConnect: (info) => { reg.info = info; messageBus.emit('state', { type: 'dirty' }); },
  });
  reg.session.prompt(`${reg.persona.body}\n\n${SUGGESTION_FORMAT}`, {
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
  openMonitorSession(reg, managers, spawn);
}
