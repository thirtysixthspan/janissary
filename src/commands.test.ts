import { describe, it, expect } from 'vitest';
import { availableCommands, getOutput } from './commands.js';
import { commands, findCommand } from './commands/index.js';
import { findPriorityConflicts } from './commands/priority.js';

function helpText(): string {
  const result = getOutput('help');
  if (result.kind !== 'output') throw new Error('help did not classify as output');
  return result.text;
}

describe('availableCommands', () => {
  it('exposes conversations without the former chat command', () => {
    expect(availableCommands).toContain('conversations');
    expect(availableCommands).not.toContain('chat');
  });

  // Derived from the registry now. The hand-written list it replaced omitted these outright, which
  // is the drift that made a second list worth deleting rather than correcting.
  it.each([['open'], ['edit'], ['queue'], ['rename'], ['profile'], ['monitor'], ['theme']])(
    'includes %s, which the hand-written list omitted',
    (name) => { expect(availableCommands).toContain(name); },
  );

  it('still carries the one built-in that has no registry entry', () => {
    expect(availableCommands).toContain('help');
  });
});

// The registry's order is its dispatch priority. Each command declares the inputs it owns, and this
// replays `resolveCommand`'s first-fit walk over them: a command appended to the list whose `match`
// also accepts an earlier entry's input — or whose own input an earlier entry already claims —
// fails here rather than misrouting every session.
describe('command registry priority', () => {
  it('routes every declared sample to the command that declares it', () => {
    expect(findPriorityConflicts(commands)).toEqual([]);
  });

  it('has every registered command declare at least one sample', () => {
    expect(commands.filter((command) => command.samples.length === 0).map((c) => c.name)).toEqual([]);
  });

  // Every dispatcher looks a resolved name up through `findCommand`, so two entries sharing a name —
  // a built-in answering a longer form of a plugin command's word — each still get their own inputs,
  // whether the command was typed or arrived in a message.
  it('finds, for each declared sample, the entry that declares it rather than the first of its name', () => {
    const misses = commands.flatMap((command) => command.samples
      .filter((sample) => findCommand(command.name, sample) !== command)
      .map((sample) => `${command.name}: ${sample}`));
    expect(misses).toEqual([]);
    expect(new Set(commands.map((command) => command.name)).size).toBeLessThan(commands.length);
  });
});

// `findCommand` first looks for the entry that both carries the name and claims the input, then falls
// back to any entry of that name. The fallback is what a typed command reaches when the input has
// already been reshaped on its way in, and what an unknown name comes back empty for.
describe('findCommand fallback', () => {
  it('falls back to the entry of that name when no match claims the input', () => {
    const search = findCommand('search', '');
    expect(search?.name).toBe('search');
  });

  it('returns undefined for a name the registry does not carry', () => {
    expect(findCommand('no-such-command', '')).toBeUndefined();
  });
});

describe('getOutput("help")', () => {
  it('documents the queue command', () => {
    expect(helpText()).toContain('`queue`');
    expect(helpText()).toContain('queue <tab> <command>');
  });

  it('documents the Ctrl+E queue-picker key binding', () => {
    expect(helpText()).toContain('Ctrl+E');
  });

  it('documents the Ctrl+G tab-navigator key binding', () => {
    expect(helpText()).toContain('Ctrl+G');
  });
});

describe('getOutput("help <section>")', () => {
  function sectionText(command: string): string {
    const result = getOutput(command);
    if (result.kind !== 'output') throw new Error(`${command} did not classify as output`);
    return result.text;
  }

  it('prints only the shell tab key table for help shell', () => {
    const text = sectionText('help shell');
    expect(text.startsWith('**Shell tab controls**')).toBe(true);
    expect(text).toContain('`!` prefix');
    expect(text).not.toContain('### Commands');
    expect(text).not.toContain('**Image tab controls**');
  });

  it('prints only the command table for help commands', () => {
    const text = sectionText('help commands');
    expect(text.startsWith('### Commands')).toBe(true);
    expect(text).toContain('`zsh`');
    expect(text).not.toContain('### Key Bindings');
  });

  it('answers an unmatched section as help output rather than an unknown command', () => {
    expect(sectionText('help nosuchsection')).toContain('No help section matches "nosuchsection". Sections: Commands, Key Bindings');
  });

  it('lists the commands in alphabetical order by name', () => {
    const names = sectionText('help commands')
      .split('\n')
      .flatMap((line) => {
        const cell = line.startsWith('| `') ? line.slice(3, line.indexOf('`', 3)) : undefined;
        return cell ? [cell.split(' ', 1)[0].toLowerCase()] : [];
      });
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual(names.toSorted((left, right) => left.localeCompare(right)));
  });

  it('leaves a word that only starts with help unknown', () => {
    expect(getOutput('helper').kind).toBe('unknown');
  });
});
