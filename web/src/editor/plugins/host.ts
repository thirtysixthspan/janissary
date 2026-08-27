// Session-scoped plugin state: which declarations were accepted, which modules have been loaded, and
// which plugins have been disabled. Load and call are individually guarded, so a throw, a rejection,
// a failed chunk fetch, or a budget overrun disables that one plugin and leaves the editor and every
// other plugin running.

import type {
  BoundBinding, EditorPluginHandler, EditorPluginLoader, EditorPluginRequest, EditorPluginResult,
} from './api';
import { claimedByCore } from './chords';
import { editorPluginDeclarations, editorPluginLoaders, validateDeclarations } from './registry';

const HANDLER_TIMEOUT_MS = 1000;

export type RunOutcome =
  | { status: 'ok'; result: EditorPluginResult | null }
  | { status: 'failed'; reason: string };

export type EditorPluginHost = {
  bindings(): readonly BoundBinding[];
  run(binding: BoundBinding, request: EditorPluginRequest): Promise<RunOutcome>;
  disable(plugin: string, reason: string): void;
  disabled(): readonly string[];
};

export type EditorPluginHostOptions = {
  declarations?: typeof editorPluginDeclarations;
  loaders?: Record<string, EditorPluginLoader>;
  timeoutMs?: number;
};

function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split(/\r?\n/, 1)[0].trim().replace(/[.!?;:]+$/u, '').trim();
  return firstLine || 'Unknown failure';
}

// Bounds a handler that returns a promise. A handler that blocks synchronously outruns this — see
// the trust note in ./api.ts.
async function withTimeout<Result>(
  call: () => Result | Promise<Result>, timeoutMs: number,
): Promise<Result> {
  const signal = AbortSignal.timeout(timeoutMs);
  const timeout = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(new Error(`handler timed out after ${timeoutMs} ms`));
    }, { once: true });
  });
  const running = (async () => call())();
  return Promise.race([running, timeout]);
}

// `onDisabled` fires once per plugin, the first time it is disabled. The host deliberately knows
// nothing about how a failure is reported — the hook wires that to the notifications path.
export function createEditorPluginHost(
  onDisabled: (plugin: string, reason: string) => void,
  options: EditorPluginHostOptions = {},
): EditorPluginHost {
  const { accepted, rejections } = validateDeclarations(options.declarations ?? editorPluginDeclarations);
  const loaders: Record<string, EditorPluginLoader> = options.loaders ?? editorPluginLoaders;
  const timeoutMs = options.timeoutMs ?? HANDLER_TIMEOUT_MS;

  const disabledPlugins = new Map<string, string>();
  const handlers = new Map<string, EditorPluginHandler>();
  const loading = new Map<string, Promise<EditorPluginHandler>>();

  const disable = (plugin: string, reason: string): void => {
    if (disabledPlugins.has(plugin)) return;
    disabledPlugins.set(plugin, reason);
    handlers.delete(plugin);
    loading.delete(plugin);
    onDisabled(plugin, reason);
  };

  for (const rejection of rejections) disable(rejection.id, rejection.reason);

  const table: BoundBinding[] = accepted.flatMap((declaration) =>
    declaration.bindings.map((binding) => ({ ...binding, plugin: declaration.id })));

  // A binding the core table already claims could never fire, so it is reported at construction
  // rather than left silently dead.
  for (const binding of table) {
    if (claimedByCore(binding.chord)) {
      disable(binding.plugin, `binding "${binding.command}" claims a chord the editor already uses`);
    }
  }

  const load = async (plugin: string): Promise<EditorPluginHandler> => {
    const cached = handlers.get(plugin);
    if (cached) return cached;
    const pending = loading.get(plugin) ?? (async () => {
      const loader = loaders[plugin];
      if (!loader) throw new Error('has no loader');
      const module = await loader();
      if (typeof module.default !== 'function') throw new Error('exports no handler');
      handlers.set(plugin, module.default);
      return module.default;
    })();
    loading.set(plugin, pending);
    return pending;
  };

  return {
    bindings: () => table.filter((binding) => !disabledPlugins.has(binding.plugin)),
    disabled: () => [...disabledPlugins.keys()],
    disable,
    run: async (binding, request) => {
      if (disabledPlugins.has(binding.plugin)) {
        return { status: 'failed', reason: disabledPlugins.get(binding.plugin) ?? 'disabled' };
      }
      try {
        const handler = await load(binding.plugin);
        const result = await withTimeout(() => handler(request), timeoutMs);
        return { status: 'ok', result: result ?? null };
      } catch (error) {
        const reason = failureReason(error);
        disable(binding.plugin, reason);
        return { status: 'failed', reason };
      }
    },
  };
}
