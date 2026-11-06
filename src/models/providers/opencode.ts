import type { ModelRecord } from '../catalog-file.js';
import {
  commandFailure, PROVIDER_TIMEOUT_MS, runProviderCommand,
  type ProviderCommand, type ProviderOutcome,
} from './result.js';

export function parseOpenCodeModels(output: string): ModelRecord[] {
  const ids = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate model id in opencode output');
  for (const id of ids) {
    const slash = id.indexOf('/');
    if (slash === 0 || slash === id.length - 1) throw new Error('invalid model id in opencode output');
  }
  return ids.map((id) => ({ id }));
}

export async function fetchOpenCodeModels(
  signal: AbortSignal,
  runCommand: ProviderCommand = runProviderCommand,
): Promise<ProviderOutcome> {
  try {
    const output = await runCommand('opencode', ['models'], { signal, timeout: PROVIDER_TIMEOUT_MS });
    return { status: 'ok', records: parseOpenCodeModels(output) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid model id')) {
      return { status: 'failed', reason: error.message };
    }
    if (error instanceof Error && error.message.startsWith('duplicate model id')) {
      return { status: 'failed', reason: error.message };
    }
    return commandFailure(error, 'opencode');
  }
}
