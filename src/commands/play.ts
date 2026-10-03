import type { Command } from './types.js';
import { runDelegated } from './delegated.js';
import { runPlay } from '../play/run.js';

export const PLAY_USAGE = 'Usage: play <file>.';

// The leading `play` keyword is stripped and the rest is the target verbatim, because a path may hold
// a space. One form: `play` takes a file and decides what plays it from its extension, so there is no
// second reading of the same words to rule out.
export function parsePlay(command: string): { target: string } | { error: string } {
  const target = command.replace(/^play\b\s*/iu, '').trim();
  return target ? { target } : { error: PLAY_USAGE };
}

export const command: Command = {
  name: 'play',
  match: (command_) => /^play\b/iu.test(command_),
  samples: ['play', 'play devbox.cast'],
  run: (command_, tab, managers) => {
    runDelegated(command_, tab.label, managers, (input) => runPlay(managers, input, tab.label));
  },
};