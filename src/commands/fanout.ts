import type { Command } from './types.js';

// `fanout opencode:<model>... <prompt>` — run one prompt across several fresh isolated workspaces and
// line the answers up to compare. The command opens no tab itself: it delegates to
// `managers.multiAgent`, which resolves the member list, provisions the clones, opens the member
// connections, and opens the comparison tab that holds the answers.
//
// It resolves identically on every path that dispatches a command — typed into a tab, sent to another
// agent as a `command` message, or asked of it as a `request` (`product/specs/command-routing.md`) —
// so a run started by another tab really does provision its workspaces, and `capture` answers with the
// run's summary rather than leaving the caller to read a transcript it will never see.
export const command: Command = {
  name: 'fanout',
  match: (command_) => /^fanout\b/i.test(command_),
  samples: ['fanout', 'fanout opencode:opencode/big-pickle what does this repository do?'],
  run: (command_, tab, managers) => {
    const outcome = managers.multiAgent.run(tab.label, command_);
    if ('error' in outcome) {
      managers.tab.append(tab.label, { input: command_, output: outcome.error });
      return;
    }
    const skipped = outcome.skipped.length === 0
      ? ''
      : ` ${outcome.skipped.length} refused.`;
    managers.tab.append(tab.label, {
      input: command_,
      output: `→ Comparing ${outcome.running} model${outcome.running === 1 ? '' : 's'} in "${outcome.label}".${skipped}`,
    });
  },
  capture: (command_, label, managers, reply) => {
    const outcome = managers.multiAgent.run(label, command_);
    if ('error' in outcome) { reply(outcome.error); return; }
    reply(`Comparing ${outcome.running} model${outcome.running === 1 ? '' : 's'} in "${outcome.label}".`);
  },
};
