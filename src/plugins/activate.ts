import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginLoader,
} from './api.js';

// Keyed by the capability union rather than listed as a Set, so adding a name to
// `TabPluginCapabilityName` without listing it here is a compile error instead of a plugin that
// declares a real capability and is then refused activation for requesting an "unknown" one.
const CAPABILITIES: Record<TabPluginCapabilityName, true> = {
  note: true,
  openOrFocusTab: true,
  openClaimedFiles: true,
  configuredViewer: true,
  openExternally: true,
  rejectRequest: true,
  reportFailure: true,
};

// The v1 capability set as data. Derived from the exhaustive record above rather than written out
// again, so a capability can never be added to the union without appearing here — which is what
// lets `documentation.test.ts` hold the published contract's prose to the real count.
export const TAB_PLUGIN_CAPABILITY_NAMES = Object.keys(CAPABILITIES) as TabPluginCapabilityName[];

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
    if (Object.hasOwn(CAPABILITIES, capability)) continue;
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
