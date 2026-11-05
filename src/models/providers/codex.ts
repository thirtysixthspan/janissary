import type { ModelRecord } from '../catalog-file.js';
import {
  commandFailure, PROVIDER_TIMEOUT_MS, runProviderCommand,
  type ProviderCommand, type ProviderOutcome,
} from './result.js';

type CodexModel = { slug: string; display_name: string; visibility: string };

export function parseCodexModels(output: string): ModelRecord[] {
  const parsed: unknown = JSON.parse(output);
  if (!isObject(parsed) || !Array.isArray(parsed.models)) throw new Error('invalid codex models response');
  const models: CodexModel[] = [];
  for (const value of parsed.models) {
    if (!isObject(value) || typeof value.visibility !== 'string') {
      throw new Error('invalid codex model entry');
    }
    if (value.visibility !== 'list') continue;
    if (typeof value.slug !== 'string' || !value.slug || typeof value.display_name !== 'string') {
      throw new Error('invalid listed codex model');
    }
    models.push({ slug: value.slug, display_name: value.display_name, visibility: value.visibility });
  }
  const ids = models.map(({ slug }) => slug);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate model id in codex output');
  return models.map(({ slug, display_name }) => ({ id: slug, name: display_name }));
}

export async function fetchCodexModels(
  signal: AbortSignal,
  runCommand: ProviderCommand = runProviderCommand,
): Promise<ProviderOutcome> {
  try {
    const output = await runCommand('codex', ['debug', 'models'], { signal, timeout: PROVIDER_TIMEOUT_MS });
    return { status: 'ok', records: parseCodexModels(output) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid codex')) {
      return { status: 'failed', reason: error.message };
    }
    if (error instanceof Error && error.message.startsWith('duplicate model id')) {
      return { status: 'failed', reason: error.message };
    }
    return commandFailure(error, 'codex');
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
