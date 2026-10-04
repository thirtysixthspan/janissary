import type { TabPluginDeclaration } from './api.js';
import { contributionRejection } from './rejections.js';
import type { PluginRecord } from './status.js';

// What every declared plugin starts life as, before anything has activated or failed. Split out of
// `TabPluginHost` because "a record starts as this" is `status.ts`'s subject rather than the host
// class's, and because the host's constructor otherwise builds two unrelated things — this registry and
// the channel subscriptions — and the second is not what it is for.
export function buildPluginRecords(
  declarations: readonly TabPluginDeclaration[],
): Map<string, PluginRecord> {
  const records = new Map<string, PluginRecord>();
  for (const declaration of declarations) {
    if (records.has(declaration.id)) {
      throw new Error(`Duplicate tab plugin id "${declaration.id}"`);
    }
    // A claim refused while a registry was being built starts life already disabled, rather than
    // having taken the app down with it while those registries were being built.
    const rejection = contributionRejection(declaration.id);
    records.set(declaration.id, rejection === undefined
      ? { declaration, state: 'declared' }
      : { declaration, state: 'disabled', reason: rejection });
  }
  return records;
}