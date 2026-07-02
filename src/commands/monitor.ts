import type { Command } from './types.js';
import { parseMonitorCommand, parseUnmonitorCommand } from '../monitor-parsing.js';

// `monitor <persona> [target...]` — start a persona-driven AI monitor. No targets:
// inline mode, watching the current tab and reporting into its transcript. With targets
// (tab labels or `group:<n>`): external mode, reporting into the persona's reporting tab.
// `monitor ask <persona> <question>` — query a running monitor's ACP directly.
export const monitor: Command = {
  name: 'monitor',
  match: (command_) => /^monitor(\s|$)/i.test(command_),
  run: (command_, tab, managers) => {
    const out = (text: string) => managers.tab.append(tab.label, { input: command_, output: text });
    const parsed = parseMonitorCommand(command_);
    if ('error' in parsed) { out(parsed.error); return; }
    if ('ask' in parsed) {
      const askError = managers.monitor.ask(tab.label, parsed.persona, parsed.question);
      if (askError) out(askError);
      return;
    }
    const error = managers.monitor.start(tab.label, parsed.persona, parsed.targets);
    if (error) { out(error); return; }
    const watched = parsed.targets.length === 0
      ? tab.label
      : parsed.targets.map((t) => (t.kind === 'tab' ? t.label : `group ${t.group}`)).join(', ');
    out(`→ Now monitoring ${watched} (persona: ${parsed.persona})`);
  },
};

// `unmonitor <persona> [target]` / `unmonitor --all` — stop monitors started from this tab.
export const unmonitor: Command = {
  name: 'unmonitor',
  match: (command_) => /^unmonitor(\s|$)/i.test(command_),
  run: (command_, tab, managers) => {
    const out = (text: string) => managers.tab.append(tab.label, { input: command_, output: text });
    const parsed = parseUnmonitorCommand(command_);
    if ('error' in parsed) { out(parsed.error); return; }
    if ('all' in parsed) {
      const stopped = managers.monitor.stopAll(tab.label);
      out(stopped > 0 ? `→ Stopped ${stopped} monitor${stopped === 1 ? '' : 's'}` : 'No monitors running from this tab.');
      return;
    }
    const stopped = managers.monitor.stop(tab.label, parsed.persona, parsed.target);
    out(stopped ? `→ Stopped ${parsed.persona} monitor` : `No "${parsed.persona}" monitor running from this tab.`);
  },
};

// `monitors` — list all active monitors.
export const monitors: Command = {
  name: 'monitors',
  match: (command_) => /^monitors$/i.test(command_),
  run: (command_, tab, managers) => {
    const lines = managers.monitor.list();
    managers.tab.append(tab.label, { input: command_, output: lines.length > 0 ? lines.join('\n') : 'No active monitors.' });
  },
};
