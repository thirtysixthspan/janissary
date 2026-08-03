import {
  TAB_PLUGIN_API_VERSION,
  isTabPluginCapability,
  type TabPluginActivation,
  type TabPluginDeclaration,
  type TabPluginLoader,
} from './api.js';

function validateDeclaration(declaration: TabPluginDeclaration): void {
  if (declaration.apiVersion !== TAB_PLUGIN_API_VERSION) {
    throw new Error(
      `requires tab plugin API ${declaration.apiVersion}; host provides ${TAB_PLUGIN_API_VERSION}`,
    );
  }
  if (!Number.isSafeInteger(declaration.payloadSchemaVersion) || declaration.payloadSchemaVersion < 1) {
    throw new Error('payload schema version must be a positive integer');
  }
  for (const capability of declaration.capabilities) {
    if (isTabPluginCapability(capability)) continue;
    throw new Error(`requests unknown capability "${capability}"`);
  }
}

export function disposePluginActivation(activation: TabPluginActivation): void {
  try {
    const disposal = activation.dispose?.();
    if (disposal) void disposal.catch(() => {});
  } catch {
    return;
  }
}

export async function activatePlugin(
  declaration: TabPluginDeclaration,
  loader: TabPluginLoader | undefined,
  timeoutMs: number,
): Promise<{ activation: TabPluginActivation; durationMs: number }> {
  validateDeclaration(declaration);
  if (!loader) throw new Error('has no server loader');

  const started = performance.now();
  const loading = (async () => {
    const module = await loader();
    return module.activate();
  })();
  const signal = AbortSignal.timeout(timeoutMs);
  let timedOut = false;
  const timeout = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      timedOut = true;
      reject(new Error(`activation timed out after ${timeoutMs} ms`));
    }, { once: true });
  });

  try {
    const activation = await Promise.race([loading, timeout]);
    return {
      activation,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    };
  } catch (error) {
    if (timedOut) {
      void loading.then(
        (activation) => { disposePluginActivation(activation); },
        () => {},
      );
    }
    throw error;
  }
}
