import { describe, expect, it, vi } from 'vitest';
import { fetchOpenCodeModels, parseOpenCodeModels } from './opencode.js';
import { PROVIDER_TIMEOUT_MS, type ProviderCommand } from './result.js';

describe('parseOpenCodeModels', () => {
  it('keeps trimmed bare and prefixed ids and ignores blank lines', () => {
    expect(parseOpenCodeModels('  gpt-6-sol  \n\nopenai/gpt-6-astra\nopencode/model\n')).toEqual([
      { id: 'gpt-6-sol' },
      { id: 'openai/gpt-6-astra' },
      { id: 'opencode/model' },
    ]);
  });

  it.each(['/model', 'provider/', 'duplicate\nduplicate'])('rejects invalid ids in %j', (output) => {
    expect(() => parseOpenCodeModels(output)).toThrow();
  });
});

describe('fetchOpenCodeModels', () => {
  it('calls the injected CLI with a signal and deadline', async () => {
    const signal = new AbortController().signal;
    const command = vi.fn<ProviderCommand>().mockResolvedValue('openai/gpt-6-astra\n');

    await expect(fetchOpenCodeModels(signal, command)).resolves.toEqual({
      status: 'ok', records: [{ id: 'openai/gpt-6-astra' }],
    });
    expect(command).toHaveBeenCalledWith('opencode', ['models'], { signal, timeout: PROVIDER_TIMEOUT_MS });
  });

  it('skips a missing CLI and fails other process errors', async () => {
    const missing = Object.assign(new Error('not found'), { code: 'ENOENT' });
    const command: ProviderCommand = async () => { throw missing; };
    await expect(fetchOpenCodeModels(new AbortController().signal, command)).resolves.toEqual({
      status: 'skipped', reason: 'opencode is not installed',
    });

    const failing: ProviderCommand = async () => { throw new Error('process failed\nextra detail'); };
    await expect(fetchOpenCodeModels(new AbortController().signal, failing)).resolves.toEqual({
      status: 'failed', reason: 'process failed',
    });
  });

  it('turns timeouts and invalid command output into full failures', async () => {
    const timedOut: ProviderCommand = async () => {
      throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    };
    await expect(fetchOpenCodeModels(new AbortController().signal, timedOut)).resolves.toEqual({
      status: 'failed', reason: 'timed out after 30 s',
    });

    const malformed: ProviderCommand = async () => '/model';
    await expect(fetchOpenCodeModels(new AbortController().signal, malformed)).resolves.toMatchObject({
      status: 'failed', reason: 'invalid model id in opencode output',
    });
  });
});
