import { describe, it, expect } from 'vitest';
import { parseHelpSections, selectHelpSection } from './help-sections.js';

const HELP = [
  '### Commands',
  '',
  '| Command | Description |',
  '| ------- | ----------- |',
  '| `help` | List available commands |',
  '',
  '### Key Bindings',
  '',
  '**Global key bindings** (work from every tab):',
  '',
  '| Key | Action |',
  '| --- | ------ |',
  '| `Ctrl+G` | Open the tab navigator |',
  '',
  '**Command bar and agent tab controls**:',
  '',
  '| Key | Action |',
  '| --- | ------ |',
  '| `Enter` | Execute the current command |',
  '',
  '**Shell tab controls** (active only while a shell tab is the visible one):',
  '',
  '| Key | Action |',
  '| --- | ------ |',
  '| `!` prefix | Send the line straight to zsh |',
  '',
  'A closing paragraph about completion.',
].join('\n');

describe('parseHelpSections', () => {
  it('returns headings and bold-labelled blocks in document order', () => {
    expect(parseHelpSections(HELP).map((section) => section.title)).toEqual([
      'Commands',
      'Key Bindings',
      'Global key bindings',
      'Command bar and agent tab controls',
      'Shell tab controls',
    ]);
  });

  it('gives a block its label and table, and stops before a following paragraph', () => {
    const shell = parseHelpSections(HELP).find((section) => section.title === 'Shell tab controls');
    expect(shell?.text).toBe([
      '**Shell tab controls** (active only while a shell tab is the visible one):',
      '',
      '| Key | Action |',
      '| --- | ------ |',
      '| `!` prefix | Send the line straight to zsh |',
    ].join('\n'));
  });

  it('runs a heading section up to the next heading, its blocks and trailing paragraph included', () => {
    const keys = parseHelpSections(HELP).find((section) => section.title === 'Key Bindings');
    expect(keys?.text.startsWith('### Key Bindings')).toBe(true);
    expect(keys?.text).toContain('`Ctrl+G`');
    expect(keys?.text).toContain('A closing paragraph about completion.');
    expect(keys?.text).not.toContain('List available commands');
  });
});

describe('selectHelpSection', () => {
  it('prefers an exact title over a prefix of a later one', () => {
    expect(selectHelpSection(HELP, 'commands').startsWith('### Commands')).toBe(true);
  });

  it('selects by a leading prefix of the title', () => {
    expect(selectHelpSection(HELP, 'shell').startsWith('**Shell tab controls**')).toBe(true);
    expect(selectHelpSection(HELP, 'key').startsWith('### Key Bindings')).toBe(true);
  });

  it('selects by whole words anywhere in the title', () => {
    expect(selectHelpSection(HELP, 'agent').startsWith('**Command bar and agent tab controls**')).toBe(true);
  });

  it('ignores case and extra whitespace', () => {
    expect(selectHelpSection(HELP, '  KEY   bindings ').startsWith('### Key Bindings')).toBe(true);
  });

  it('names every section when nothing matches', () => {
    expect(selectHelpSection(HELP, 'nothing here')).toBe(
      'No help section matches "nothing here". Sections: Commands, Key Bindings, Global key bindings, '
      + 'Command bar and agent tab controls, Shell tab controls.',
    );
  });
});
