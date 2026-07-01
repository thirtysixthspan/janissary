import type { Command } from './types.js';
import type { MonitorSuggestion } from '../types.js';
import { pushSuggestion } from '../monitor-window.js';

// MOCK (UI preview): `monitor [name]` opens the named monitor's reporting tab (default
// `security`), colored after the current tab, and seeds fake suggestions so the client
// feed can be evaluated before the real monitoring backend (personas, dedicated ACP
// connections, 30s batching) exists. Repeat calls push one more suggestion to exercise
// live updates and auto-follow. The real grammar (`monitor <persona> [targets...]`)
// replaces this stub.

let counter = 0;

function mockSuggestion(about: string): MonitorSuggestion {
  const samples: Omit<MonitorSuggestion, 'id' | 'timestamp' | 'about' | 'persona'>[] = [
    { text: 'The last test run failed on buffer.test.ts — the wrap width changed but the fixture was not updated.', command: 'shell npm run test:diff:server' },
    { text: 'That curl pipes straight into sh — consider inspecting the script before executing it.' },
    { text: 'Lint has been failing for the last three commands; the diff-scoped linter would pinpoint it.', command: 'shell ./scripts/run.mjs lint-files' },
    { text: 'The .env file was just printed to the transcript — rotate any exposed keys.', command: 'shell git status' },
  ];
  const sample = samples[counter % samples.length];
  counter += 1;
  return { ...sample, id: `mock-${counter}`, timestamp: Date.now(), persona: 'mock', about };
}

export const command: Command = {
  name: 'monitor',
  match: (command_) => /^monitor\b/i.test(command_),
  run: (command_, tab, managers) => {
    const name = command_.split(/\s+/, 2)[1] ?? 'security';
    const dotColor = managers.tab.tabs.find((t) => t.label === tab.label)?.dotColor ?? '#5b9cff';
    const existing = managers.tab.tabs.some((t) => t.view === 'monitor' && t.label === name);
    const count = existing ? 1 : 3;
    for (let index = 0; index < count; index++) pushSuggestion(managers, name, dotColor, mockSuggestion(tab.label));
    managers.tab.append(tab.label, { input: command_, output: `→ [mock] pushed ${count} suggestion(s) to the "${name}" monitor` });
  },
};
