import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginActivation, type TabPluginApiVersion, type TabPluginDeclaration,
} from '../api.js';
import { withBudget } from '../budget.js';

export function apiCompatible(host: TabPluginApiVersion, required: TabPluginApiVersion): boolean {
  return host.major === required.major && host.minor >= required.minor;
}

export async function disposeActivation(
  activation: TabPluginActivation, disposed: WeakSet<object>, budgetMs: number,
): Promise<void> {
  if (disposed.has(activation)) return;
  disposed.add(activation);
  const dispose = async () => activation.dispose?.();
  try { await withBudget(dispose(), budgetMs, 'disposal'); } catch { /* contained */ }
}

export function validatePluginActivation(
  declaration: TabPluginDeclaration, activation: TabPluginActivation,
): void {
  if (!apiCompatible(TAB_PLUGIN_API_VERSION, activation.apiVersion)) {
    throw new Error('activation returned an incompatible API version');
  }
  if (activation.payloadSchemaVersion !== declaration.payloadSchemaVersion) {
    throw new Error('activation returned a mismatched payload schema version');
  }
  if (typeof activation.validateTabPayload !== 'function') throw new Error('activation omitted its payload validator');
  const declaredCommands = new Set(declaration.commands);
  const registeredCommands = Object.entries(activation.commands ?? {});
  const registeredNames = new Set(registeredCommands.map(([name]) => name));
  if ([...declaredCommands].some((name) => !registeredNames.has(name))) throw new Error('activation omitted a declared command');
  if (registeredCommands.some(([name, handler]) => !declaredCommands.has(name) || typeof handler !== 'function')) {
    throw new Error('activation returned an undeclared or invalid command');
  }
  if (Boolean(declaration.opener) !== Boolean(activation.opener)
    || (activation.opener && (typeof activation.opener.inline !== 'function' || typeof activation.opener.external !== 'function'))) {
    throw new Error('activation returned an incompatible opener');
  }
  const intentHooks = [activation.validateIntent, activation.handleIntent, activation.validateIntentReply];
  if (intentHooks.some(Boolean) && intentHooks.some((hook) => typeof hook !== 'function')) {
    throw new Error('activation returned an incomplete intent contract');
  }
}
