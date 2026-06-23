import type { Command } from './types.js';

export const command: Command = {
  name: 'hist',
  match: (cmd) => cmd.toLowerCase() === 'hist',
  handler: (_cmd, ctx) => {
    const { frequentHistory, setHistoryPickerIdx, setHistoryPickerOpen } = ctx;
    if (frequentHistory.length > 0) {
      setHistoryPickerIdx(frequentHistory.length - 1);
      setHistoryPickerOpen(true);
    }
  },
};
