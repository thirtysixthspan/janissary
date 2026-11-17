import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeWebCommand } from './web.js';
import { readCompletionCursor } from './cursor.js';
import { completionPolicy, type CompletionPolicy } from './command-policy.js';
import { NativeCommandSettingsManager } from '../native-commands/manager.js';
import { tavilyManifest, tinyfishManifest } from '../web/providers/catalog.js';

const at = (line: string) => readCompletionCursor(line, line.length);

let settings: string;

function policyWith(values: Record<string, { enabled?: boolean }>): CompletionPolicy {
  const home = path.join(settings, 'home');
  mkdirSync(path.join(home, '.janissary'), { recursive: true });
  writeFileSync(path.join(home, '.janissary', 'commands.json'), JSON.stringify(values));
  return completionPolicy(new NativeCommandSettingsManager(path.join(settings, 'project'), home).current());
}

beforeAll(() => {
  settings = mkdtempSync(path.join(tmpdir(), 'web-completion-settings-'));
});

afterAll(() => {
  rmSync(settings, { recursive: true, force: true });
});

describe('completeWebCommand', () => {
  it('completes the search subcommand', () => {
    expect(completeWebCommand(at('web '))?.matches).toEqual(['search']);
    expect(completeWebCommand(at('web s'))?.newInput).toBe('web search ');
  });

  it('returns null for another command', () => {
    expect(completeWebCommand(at('browser s'))).toBeNull();
  });

  it('completes nothing when the web search row is disabled', () => {
    const policy = policyWith({ 'web search': { enabled: false } });

    expect(completeWebCommand(at('web '), policy)?.matches).toEqual([]);

    const line = 'web search x -';
    const result = completeWebCommand(at(line), policy);
    expect(result?.matches).toEqual([]);
    expect(result?.newInput).toBe(line);
  });

  it('offers the flags not yet used after the query', () => {
    expect(completeWebCommand(at('web search node.js -'))?.matches)
      .toEqual(['--depth', '--max-chars', '--provider', '--results']);
    expect(completeWebCommand(at('web search node.js --results 3 -'))?.matches)
      .toEqual(['--depth', '--max-chars', '--provider']);
    expect(completeWebCommand(at('web search node.js --d'))?.newInput)
      .toBe('web search node.js --depth ');
  });

  it('offers nothing before the query or for a query word that looks like a flag', () => {
    for (const line of ['web search -', 'web search foo -site:x']) {
      const result = completeWebCommand(at(line));
      expect(result?.matches).toEqual([]);
      expect(result?.newInput).toBe(line);
    }
  });

  it('completes the depth values', () => {
    expect(completeWebCommand(at('web search x --depth '))?.matches).toEqual(['advanced', 'basic']);
    expect(completeWebCommand(at('web search x --depth a'))?.newInput)
      .toBe('web search x --depth advanced ');
  });

  it('completes auto and every registered provider name', () => {
    expect(completeWebCommand(at('web search x --provider '))?.matches)
      .toEqual(['auto', 'tavily', 'tinyfish']);
    expect(completeWebCommand(at('web search x --provider t'))?.matches)
      .toEqual(['tavily', 'tinyfish']);
  });

  it('offers nothing for the query, the numeric values, and another web subcommand', () => {
    const lines = [
      'web search rep',
      'web search x --results ',
      'web search x --results 5',
      'web search x --max-chars ',
      'web fetch ',
    ];
    for (const line of lines) {
      const result = completeWebCommand(at(line));
      expect(result?.matches).toEqual([]);
      expect(result?.newInput).toBe(line);
    }
    expect(completeWebCommand(at('web fetch '))).not.toBeNull();
  });

  it('does not activate a provider when completing provider names', () => {
    const tavily = vi.spyOn(tavilyManifest, 'activate');
    const tinyfish = vi.spyOn(tinyfishManifest, 'activate');

    completeWebCommand(at('web search x --provider '));

    expect(tavily).not.toHaveBeenCalled();
    expect(tinyfish).not.toHaveBeenCalled();

    tavily.mockRestore();
    tinyfish.mockRestore();
  });
});
