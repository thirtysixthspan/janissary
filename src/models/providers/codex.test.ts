import { describe, expect, it, vi } from 'vitest';
import { fetchCodexModels, parseCodexModels } from './codex.js';
import { PROVIDER_TIMEOUT_MS, type ProviderCommand } from './result.js';

describe('parseCodexModels', () => {
  it('keeps listed models and maps slug and display name', () => {
    expect(parseCodexModels(JSON.stringify({ models: [
      { slug: 'gpt-6-sol', display_name: 'GPT 6 Sol', visibility: 'list' },
      { slug: 'internal', display_name: 'Internal', visibility: 'hidden' },
    ] }))).toEqual([{ id: 'gpt-6-sol', name: 'GPT 6 Sol' }]);
  });

  it('rejects malformed responses, listed entries, and duplicate listed ids', () => {
    expect(() => parseCodexModels('{')).toThrow();
    expect(() => parseCodexModels('{"models":[]}')).not.toThrow();
    expect(() => parseCodexModels('{"models":null}')).toThrow('invalid codex models response');
    expect(() => parseCodexModels(JSON.stringify({ models: [{ visibility: 'list' }] }))).toThrow('invalid listed codex model');
    expect(() => parseCodexModels(JSON.stringify({ models: [
      { slug: 'same', display_name: 'Same', visibility: 'list' },
      { slug: 'same', display_name: 'Same', visibility: 'list' },
    ] }))).toThrow('duplicate model id in codex output');
  });
});

describe('fetchCodexModels', () => {
  it('calls the injected CLI with the expected arguments and deadline', async () => {
    const signal = new AbortController().signal;
    const command = vi.fn<ProviderCommand>().mockResolvedValue('{"models":[]}');

    await expect(fetchCodexModels(signal, command)).resolves.toEqual({ status: 'ok', records: [] });
    expect(command).toHaveBeenCalledWith('codex', ['debug', 'models'], { signal, timeout: PROVIDER_TIMEOUT_MS });
  });

  it('distinguishes an absent CLI from other process errors', async () => {
    const missing = Object.assign(new Error('not found'), { code: 'ENOENT' });
    await expect(fetchCodexModels(new AbortController().signal, async () => { throw missing; })).resolves.toEqual({
      status: 'skipped', reason: 'codex is not installed',
    });
    await expect(fetchCodexModels(new AbortController().signal, async () => { throw new Error('failed'); })).resolves.toEqual({
      status: 'failed', reason: 'failed',
    });
  });
});
