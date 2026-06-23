import type { Command } from './types.js';
import { loadAgentState } from '../agent-state.js';

export const command: Command = {
  name: 'state',
  match: (cmd) => cmd.toLowerCase() === 'state',
  handler: (_cmd, ctx) => {
    const { tabs, activeTab, updateCurrentTab } = ctx;
    const label = tabs[activeTab]?.label;
    const state = loadAgentState(label);
    const formatVal = (v: unknown, maxLines = 10): string => {
      if (v === undefined || v === null) return '<empty>';
      if (typeof v === 'string') return v || '<empty>';
      if (typeof v === 'boolean' || typeof v === 'number') return String(v);
      if (Array.isArray(v)) {
        if (v.length === 0) return '<empty>';
        const lines = v.flatMap((item) => {
          if (typeof item === 'object' && item !== null) {
            const e = item as Record<string, unknown>;
            return [
              `> ${e.input ?? ''}`,
              ...(typeof e.output === 'string' && e.output
                ? e.output.split('\n').map((l) => `  ${l}`)
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
          ([k, val]) => `  ${k}: ${formatVal(val)}`,
        );
        if (lines.length <= maxLines) return lines.join('\n');
        return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
      }
      return String(v);
    };
    const fields = state
      ? Object.entries(state).map(([k, v]) => `${k}:\n${formatVal(v)}`).join('\n\n')
      : `No state file found for "${label}".`;
    updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: _cmd, output: fields }], scrollOffset: 0 }));
  },
};
