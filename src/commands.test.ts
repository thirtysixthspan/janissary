import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { availableCommands, getOutput } from './commands.js';
import { commands, findCommand } from './commands/index.js';
import { findPriorityConflicts } from './commands/priority.js';
import { listHelpPages } from './help-pages.js';
import { resolveCommand } from './resolve.js';

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
  it.each([['open'], ['edit'], ['execute'], ['queue'], ['rename'], ['profile'], ['monitor'], ['tab'], ['theme']])(
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

describe('execute command routing', () => {
  it('routes execute case-insensitively through the registry', () => {
    expect(resolveCommand('ExEcUtE deploy')).toEqual({ kind: 'app', name: 'execute', cmd: 'ExEcUtE deploy' });
  });
});

describe('scripts command routing', () => {
  it('routes scripts and scripts left to the scripts tab plugin', () => {
    expect(resolveCommand('scripts')).toEqual({ kind: 'app', name: 'scripts', cmd: 'scripts' });
    expect(resolveCommand('scripts left')).toEqual({ kind: 'app', name: 'scripts', cmd: 'scripts left' });
  });
});

describe('getOutput help pages', () => {
  function outputText(command: string): string {
    const result = getOutput(command);
    if (result.kind !== 'output') throw new Error(`${command} did not classify as output`);
    return result.text;
  }

  it('prints the command table for bare help and help commands', () => {
    const text = outputText('help commands');
    expect(helpText()).toBe(text);
    expect(text.startsWith('### Commands')).toBe(true);
    expect(text).toContain('`shell`');
    const queueRow = text.split('\n').find((line) => line.startsWith('| `queue` |'));
    expect(queueRow).toContain('Ctrl+E');
    expect(text).not.toContain('### Key Bindings');
  });

  it('summarizes all files detail modes and view clauses in the command table', () => {
    const filesRow = outputText('help commands').split('\n').find((line) => line.startsWith('| `files` |'));
    if (!filesRow) throw new Error('files command row is missing');

    for (const syntax of [
      '`with <name\\|size\\|modified\\|permissions>`',
      '`expand <path>`',
      '`collapse <path>`',
      '`cursor <path>`',
      '`anchor <path>`',
      '`select <path>`',
      '(quote labels with spaces or quotes)',
    ]) {
      expect(filesRow).toContain(syntax);
    }
  });

  it('escapes detail-mode separators in the files command table source', () => {
    const helpDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'help');
    const filesRow = readFileSync(path.join(helpDirectory, 'commands.md'), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('| `files` |'));
    if (!filesRow) throw new Error('files command source row is missing');

    const descriptionStart = filesRow.indexOf(' | ', filesRow.indexOf('`') + 1) + 3;
    const description = filesRow.slice(descriptionStart, filesRow.lastIndexOf(' |'));
    expect(description).toContain('`with <name\\|size\\|modified\\|permissions>`');
    expect(description.replaceAll(String.raw`\|`, '')).not.toContain('|');
  });

  it('prints all key tables only from help keys', () => {
    const text = outputText('help keys');
    expect(text.startsWith('### Key Bindings')).toBe(true);
    expect(text).toContain('Ctrl+E');
    expect(text).toContain('Ctrl+G');
    expect(text).toContain('Shell tab controls');
  });

  it('prints a matching command page, case-insensitively and after one leading slash', () => {
    expect(outputText('help shell').startsWith('### shell')).toBe(true);
    expect(outputText('help Profile')).toContain('### profile');
    expect(outputText('help /quit')).toContain('### quit');
  });

  it.each([
    ['help ../package', '../package'],
    ['help editor', 'editor'],
    ['help nosuch', 'nosuch'],
    ['help /nosuch', 'nosuch'],
    ['help //quit', '/quit'],
  ])('answers a missing page for %s with the exact help message', (command, name) => {
    expect(outputText(command)).toBe(`No help for "${name}". Type "help" for available commands.`);
  });

  it('lists the commands in alphabetical order by name', () => {
    const names = outputText('help commands')
      .split('\n')
      .flatMap((line) => {
        const cell = line.startsWith('| `') ? line.slice(3, line.indexOf('`', 3)) : undefined;
        return cell ? [cell.split(' ', 1)[0].toLowerCase()] : [];
      });
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual(names.toSorted((left, right) => left.localeCompare(right)));
  });

  it('limits ordinary command descriptions to 200 characters and bounds the files row', () => {
    const commandRows = outputText('help commands')
      .split('\n')
      .filter((line) => line.startsWith('| `'))
      .map((line) => {
        const separator = line.indexOf(' | ', line.indexOf('`') + 1);
        return {
          name: line.slice(3, line.indexOf('`', 3)).split(' ', 1)[0].toLowerCase(),
          description: line.slice(separator + 3, line.lastIndexOf(' |')),
        };
      });

    expect(commandRows.length).toBeGreaterThan(1);
    const filesRows = commandRows.filter(({ name }) => name === 'files');
    expect(filesRows).toHaveLength(1);
    expect(filesRows[0]?.description.length).toBeGreaterThan(200);
    expect(filesRows[0]?.description.length).toBeLessThanOrEqual(350);
    expect(commandRows.filter(({ name, description }) => name !== 'files' && description.length > 200)).toEqual([]);
  });

  it('has a help page for each command row and no orphan command pages', () => {
    const commandNames = outputText('help commands')
      .split('\n')
      .flatMap((line) => {
        const cell = line.startsWith('| `') ? line.slice(3, line.indexOf('`', 3)) : undefined;
        return cell ? [cell.split(' ', 1)[0].toLowerCase()] : [];
      });
    const helpDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'help');
    const pages = listHelpPages(helpDirectory).filter((page) => !['commands', 'keys'].includes(page));

    expect(pages.toSorted((left, right) => left.localeCompare(right))).toEqual(
      commandNames.toSorted((left, right) => left.localeCompare(right)),
    );
  });

  it('leaves a word that only starts with help unknown', () => {
    expect(getOutput('helper').kind).toBe('unknown');
  });
});
