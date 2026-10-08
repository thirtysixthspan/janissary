import type { Tab } from '../tab/types.js';
import type { TabPluginDeclaration } from '../plugins/api.js';
import type { TabView } from '../protocol/tab.js';

type QueueTab = Pick<Tab, 'view' | 'plugin' | 'hasCommandQueue'>;

export function declaresCommandQueue(declaration: Partial<Pick<TabPluginDeclaration, 'capabilities'>> | undefined): boolean {
  return declaration?.capabilities?.includes('queueLine') === true
    && declaration.capabilities.includes('nextQueuedLine');
}

export function supportsCommandQueue(
  tab: QueueTab,
  declarations: readonly TabPluginDeclaration[],
): boolean {
  return queueAvailable(tab,
    declarations.find((declaration) => declaration.id === tab.plugin?.id),
  );
}

export function queueAvailable(
  tab: QueueTab,
  declaration: Partial<Pick<TabPluginDeclaration, 'capabilities'>> | undefined,
): boolean {
  return tab.hasCommandQueue === true || (tab.view === 'plugin' && declaresCommandQueue(declaration));
}

export function queueProjection(
  tab: QueueTab,
  declaration: Partial<Pick<TabPluginDeclaration, 'capabilities'>> | undefined,
  lines: string[],
): Pick<TabView, 'commandQueue' | 'hasCommandQueue'> {
  return queueAvailable(tab, declaration)
    ? { commandQueue: lines, hasCommandQueue: true }
    : { commandQueue: [] };
}
