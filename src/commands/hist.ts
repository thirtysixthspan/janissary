import type { Command } from './types.js';

export const command: Command = {
  name: 'hist',
  match: (command_) => command_.toLowerCase() === 'hist',
  handler: (_command, context) => {
    const { frequentHistory, setHistoryPickerIdx, setHistoryPickerOpen } = context;
    if (frequentHistory.length > 0) {
      setHistoryPickerIdx(frequentHistory.length - 1);
      setHistoryPickerOpen(true);
    }
  },
};
