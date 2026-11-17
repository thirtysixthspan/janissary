import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeWebCommand } from './web.js';
import { readCompletionCursor } from './cursor.js';
import { completionPolicy, type CompletionPolicy } from './command-policy.js';
import { NativeCommandSettingsManager } from '../native-commands/manager.js';
import { webProviderCatalog } from '../web/providers/catalog.js';

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
  it('completes the subcommands', () => {
    expect(completeWebCommand(at('web '))?.matches).toEqual(['fetch', 'search']);
    expect(completeWebCommand(at('web s'))?.newInput).toBe('web search ');
    expect(completeWebCommand(at('web f'))?.newInput).toBe('web fetch ');
  });

  it('returns null for another command', () => {
    expect(completeWebCommand(at('browser s'))).toBeNull();
  });

  it('completes only fetch when the web search row is disabled', () => {
    const policy = policyWith({ 'web search': { enabled: false } });

    expect(completeWebCommand(at('web '), policy)?.matches).toEqual(['fetch']);

    const searchLine = 'web search x -';
    const searchResult = completeWebCommand(at(searchLine), policy);
    expect(searchResult?.matches).toEqual([]);
    expect(searchResult?.newInput).toBe(searchLine);

    expect(completeWebCommand(at('web fetch https://x -'), policy)?.matches)
      .toEqual(['--format', '--max-chars', '--offset', '--provider', '--timeout']);
  });

  it('completes only search when fetch is disabled', () => {
    const policy: CompletionPolicy = { allows: (input) => input !== 'web fetch', names: [] };

    expect(completeWebCommand(at('web '), policy)?.matches).toEqual(['search']);

    const fetchLine = 'web fetch https://x -';
    const fetchResult = completeWebCommand(at(fetchLine), policy);
    expect(fetchResult?.matches).toEqual([]);
    expect(fetchResult?.newInput).toBe(fetchLine);

    expect(completeWebCommand(at('web search x -'), policy)?.matches)
      .toEqual(['--depth', '--max-chars', '--provider', '--results']);
  });

  it('completes nothing when the web row is disabled', () => {
    const policy = policyWith({ web: { enabled: false } });

    expect(completeWebCommand(at('web '), policy)?.matches).toEqual([]);

    for (const line of ['web search x -', 'web fetch https://x -']) {
      const result = completeWebCommand(at(line), policy);
      expect(result?.matches).toEqual([]);
      expect(result?.newInput).toBe(line);
    }
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

  it('offers the fetch flags not yet used after the URL', () => {
    expect(completeWebCommand(at('web fetch https://x -'))?.matches)
      .toEqual(['--format', '--max-chars', '--offset', '--provider', '--timeout']);
    expect(completeWebCommand(at('web fetch https://x --format text -'))?.matches)
      .toEqual(['--max-chars', '--offset', '--provider', '--timeout']);
    expect(completeWebCommand(at('web fetch https://x --t'))?.newInput)
      .toBe('web fetch https://x --timeout ');
  });

  it('offers no flags at the URL position', () => {
    const line = 'web fetch -';
    const result = completeWebCommand(at(line));
    expect(result?.matches).toEqual([]);
    expect(result?.newInput).toBe(line);
  });

  it('completes the format values', () => {
    expect(completeWebCommand(at('web fetch https://x --format '))?.matches)
      .toEqual(['html', 'markdown', 'text']);
    expect(completeWebCommand(at('web fetch https://x --format m'))?.newInput)
      .toBe('web fetch https://x --format markdown ');
  });

  it('completes auto and every fetch-capable provider name', () => {
    expect(completeWebCommand(at('web fetch https://x --provider '))?.matches)
      .toEqual(['auto', 'local', 'tavily', 'tinyfish']);
    expect(completeWebCommand(at('web fetch https://x --provider t'))?.matches)
      .toEqual(['tavily', 'tinyfish']);
    expect(completeWebCommand(at('web fetch https://x --provider l'))?.newInput)
      .toBe('web fetch https://x --provider local ');
  });

  it('offers nothing for the query, the numeric values, and another web subcommand', () => {
    const lines = [
      'web search rep',
      'web search x --results ',
      'web search x --results 5',
      'web search x --max-chars ',
      'web foo ',
    ];
    for (const line of lines) {
      const result = completeWebCommand(at(line));
      expect(result?.matches).toEqual([]);
      expect(result?.newInput).toBe(line);
    }
    expect(completeWebCommand(at('web foo '))).not.toBeNull();
  });

  it('offers nothing for the URL and the numeric values', () => {
    const lines = [
      'web fetch ',
      'web fetch https://exa',
      'web fetch https://x --timeout ',
      'web fetch https://x --max-chars ',
      'web fetch https://x --offset ',
      'web fetch https://x --offset 1',
    ];
    for (const line of lines) {
      const result = completeWebCommand(at(line));
      expect(result?.matches).toEqual([]);
      expect(result?.newInput).toBe(line);
      expect(result).not.toBeNull();
    }
  });

  it('reads the subcommand case-insensitively', () => {
    expect(completeWebCommand(at('WEB Fetch https://x -'))?.matches)
      .toEqual(['--format', '--max-chars', '--offset', '--provider', '--timeout']);
  });

  it('does not activate a provider when completing provider names', () => {
    const spies = webProviderCatalog.map((manifest) => vi.spyOn(manifest, 'activate'));

    completeWebCommand(at('web search x --provider '));
    completeWebCommand(at('web fetch x --provider '));

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    for (const spy of spies) spy.mockRestore();
  });
});
