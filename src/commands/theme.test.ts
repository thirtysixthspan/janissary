import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { command } from './theme.js';
import { loadConfig, getConfig } from '../config.js';
import { APP_THEMES, DEFAULT_APP_THEME } from '../app-themes.js';

describe('theme command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('theme');
  });

  it('matches "theme" case-insensitively, with or without an argument', () => {
    expect(command.match('theme')).toBe(true);
    expect(command.match('theme nord')).toBe(true);
    expect(command.match('THEME nord')).toBe(true);
    expect(command.match('theme sync')).toBe(true);
  });

  it('does not match non-theme input', () => {
    expect(command.match('themes')).toBe(false);
    expect(command.match('syntax theme')).toBe(false);
  });
});

describe('theme command run', () => {
  let tmpDir: string;
  let appended: { input: string; output: string }[];
  let tab: { label: string };
  let managers: unknown;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'theme-cmd-test-'));
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

  it('lists themes with the active one marked on bare "theme"', () => {
    run('theme');
    expect(appended[0].output).toContain('Available themes:');
    expect(appended[0].output).toContain(`* ${DEFAULT_APP_THEME}`);
    for (const theme of APP_THEMES) expect(appended[0].output).toContain(theme);
  });

  it('sets a valid theme, persists it, and appends confirmation', () => {
    run('theme dracula');
    expect(appended).toEqual([{ input: 'theme dracula', output: 'Theme set to "dracula".' }]);
    expect(getConfig().theme).toBe('dracula');

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.theme).toBe('dracula');
  });

  it('canonicalizes case-insensitive theme names', () => {
    run('theme DRACULA');
    expect(appended[0].output).toBe('Theme set to "dracula".');
    expect(getConfig().theme).toBe('dracula');
  });

  it('lists available themes on an invalid name', () => {
    run('theme bogus');
    expect(appended[0].output).toContain('Unknown theme "bogus"');
    for (const theme of APP_THEMES) expect(appended[0].output).toContain(theme);
  });

  it('leaves the syntax theme untouched when setting an app theme', () => {
    const before = getConfig().syntaxTheme;
    run('theme nord');
    expect(getConfig().syntaxTheme).toBe(before);
  });

  it('theme sync sets the syntax theme when a same-named syntax theme exists', () => {
    run('theme nord');
    run('theme sync');
    expect(appended[1].output).toBe('Syntax theme set to "nord".');
    expect(getConfig().syntaxTheme).toBe('nord');
  });

  it('theme sync reports when no same-named syntax theme exists', () => {
    run('theme dracula');
    const before = getConfig().syntaxTheme;
    run('theme sync');
    expect(appended[1].output).toBe('No syntax theme named "dracula" exists — syntax theme unchanged.');
    expect(getConfig().syntaxTheme).toBe(before);
  });
});
