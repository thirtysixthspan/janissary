import type { Command } from './types.js';
import { loadAgentState } from '../agent-state.js';

export const command: Command = {
  name: 'state',
  match: (command_) => command_.toLowerCase() === 'state',
  handler: (_command, context) => {
    const { tabs, activeTab, updateCurrentTab } = context;
    const label = tabs[activeTab]?.label;
    const state = loadAgentState(label);
    const formatValue = (v: unknown, maxLines = 10): string => {
      if (v === undefined || v === null) return '<empty>';
      if (typeof v === 'string') return v || '<empty>';
      if (typeof v === 'boolean' || typeof v === 'number') return String(v);
      if (Array.isArray(v)) {
        if (v.length === 0) return '<empty>';
        const lines = v.flatMap((item) => {
          if (typeof item === 'object' && item !== null) {
            const entry = item as Record<string, unknown>;
            return [
              `> ${entry.input ?? ''}`,
              ...(typeof entry.output === 'string' && entry.output
                ? entry.output.split('\n').map((l) => `  ${l}`)
                : ['  <empty>']),
            ];
          }
          return [`  - ${JSON.stringify(item)}`];
        });
        if (lines.length <= maxLines) return lines.join('\n');
        return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
      }
      if (typeof v === 'object') {
        const lines = Object.entries(v as Record<string, unknown>).map(
          ([k, value]) => `  ${k}: ${formatValue(value)}`,
        );
        if (lines.length <= maxLines) return lines.join('\n');
        return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
      }
      return String(v);
    };
    const fields = state
      ? Object.entries(state).map(([k, v]) => `${k}:\n${formatValue(v)}`).join('\n\n')
      : `No state file found for "${label}".`;
    updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: _command, output: fields }], scrollOffset: 0 }));
  },
};
