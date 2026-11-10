import type { TabPluginClientCapabilities } from './api';
import { errorText } from '@shared/error-text';

async function sendIntent(
  capabilities: Pick<TabPluginClientCapabilities, 'intent'>,
  name: string,
  payload: unknown,
): Promise<void> {
  try {
    await capabilities.intent(name, payload);
  } catch (error: unknown) {
    console.warn(`Plugin intent "${name}" failed: ${errorText(error)}`);
  }
}

export function fireIntent(
  capabilities: Pick<TabPluginClientCapabilities, 'intent'>,
  name: string,
  payload: unknown,
): void {
  void sendIntent(capabilities, name, payload);
}
