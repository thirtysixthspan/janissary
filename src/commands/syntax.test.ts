import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { command } from './syntax.js';
import { loadConfig, getConfig } from '../config.js';
import { SYNTAX_THEMES, DEFAULT_SYNTAX_THEME } from '../syntax-themes.js';

describe('syntax command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('syntax');
  });

  it('matches "syntax" case-insensitively, with or without an argument', () => {
    expect(command.match('syntax')).toBe(true);
    expect(command.match('syntax theme nord')).toBe(true);
    expect(command.match('SYNTAX theme nord')).toBe(true);
  });

  it('does not match non-syntax input', () => {
    expect(command.match('syntaxx')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('syntax command run', () => {
  let tmpDir: string;
  let appended: { input: string; output: string }[];
  let tab: { label: string };
  let managers: unknown;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'syntax-cmd-test-'));
    loadConfig(tmpDir);
    appended = [];
    tab = { label: 'janus' };
    managers = {
      tab: {
        append: (_label: string, entry: { input: string; output: string }) => {
          appended.push(entry);
        },
      },
    };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const run = (command_: string) => command.run(command_, { ...tab, index: 0 }, managers as never);

  it('shows usage for bare "syntax"', () => {
    run('syntax');
    expect(appended).toEqual([{ input: 'syntax', output: 'Usage: syntax theme [name]' }]);
  });

  it('shows usage for an unrecognized subcommand', () => {
    run('syntax bogus');
    expect(appended[0].output).toBe('Usage: syntax theme [name]');
  });

  it('sets a valid theme, persists it, and appends confirmation', () => {
    run('syntax theme nord');
    expect(appended).toEqual([{ input: 'syntax theme nord', output: 'Syntax theme set to "nord".' }]);
    expect(getConfig().syntaxTheme).toBe('nord');

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.syntaxTheme).toBe('nord');
  });

  it('canonicalizes case-insensitive theme names', () => {
    run('syntax theme NORD');
    expect(appended[0].output).toBe('Syntax theme set to "nord".');
    expect(getConfig().syntaxTheme).toBe('nord');
  });

  it('lists available themes on an invalid name', () => {
    run('syntax theme bogus');
    expect(appended[0].output).toContain('Unknown theme "bogus"');
    for (const theme of SYNTAX_THEMES) expect(appended[0].output).toContain(theme);
  });

  it('lists themes with the active one marked on bare "syntax theme"', () => {
    run('syntax theme');
    expect(appended[0].output).toContain('Available themes:');
    expect(appended[0].output).toContain(`* ${DEFAULT_SYNTAX_THEME}`);
  });
});
