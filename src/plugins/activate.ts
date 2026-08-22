import {
  TAB_PLUGIN_API_VERSION,
  isTabPluginCapability,
  isTabPluginNotificationTopic,
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
  const topics = declaration.notifications ?? [];
  for (const topic of topics) {
    if (isTabPluginNotificationTopic(topic)) continue;
    throw new Error(`subscribes to unknown notification topic "${topic}"`);
  }
}

// A command claim with no handler is answered as a rejection when the command runs, because it has a
// caller and a transcript to answer into. A notification has neither, so a declaration naming a topic
// with nothing to deliver it to is caught here — the first moment the host holds the activation.
// A contributed selection action is caught in the same place and for the same reason: the navigator
// renders its label from the declaration alone, so an entry with nothing behind it would be offered
// to the user before anything could discover it does not run.
function validateActivation(
  declaration: TabPluginDeclaration,
  activation: TabPluginActivation,
): void {
  const topics = declaration.notifications ?? [];
  if (topics.length > 0 && !activation.notify) {
    throw new Error(`subscribes to "${topics.join('", "')}" but provides no notify handler`);
  }
  const selection = declaration.selectionAction;
  if (selection && !activation.selectionAction) {
    throw new Error(`contributes "${selection.label}" but provides no selectionAction handler`);
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
    validateActivation(declaration, activation);
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
