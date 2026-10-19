import type { Managers } from '../managers.js';
import type {
  TabPluginActivation, TabPluginDeclaration, TabPluginResources, TabPluginServerCapabilities,
  TabPluginTabUpdate,
} from './api.js';
import { declaredResources } from './declared-resources.js';
import type { PluginFailureOrigin } from './failure.js';
import { validateTabValue } from './tab-value.js';

type UpdateTabCapabilityOptions = {
  managers: Managers;
  declaration: TabPluginDeclaration;
  activation: TabPluginActivation;
  origin: PluginFailureOrigin;
  isEnabled: () => boolean;
  disable?: (error: unknown, origin: PluginFailureOrigin) => void;
};

export function updateTabCapability({
  managers, declaration, activation, origin, isEnabled, disable,
}: UpdateTabCapabilityOptions): TabPluginServerCapabilities['updateTab'] {
  return (instanceKey, factory) => {
    if (!isEnabled()) return;
    let refused = false;
    try {
      managers.tab.updatePluginTab(declaration.id, instanceKey, (resources: TabPluginResources) => {
        const update: TabPluginTabUpdate = factory(declaredResources(declaration, resources));
        try {
          validateTabValue(activation, update);
        } catch {
          refused = true;
          throw new Error('produced an invalid tab payload');
        }
        return update;
      });
    } catch (error) {
      if (!refused) throw error;
      disable?.(new Error('produced an invalid tab payload'), origin);
    }
  };
}
