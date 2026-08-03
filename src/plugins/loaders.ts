import type { TabPluginLoader } from './api.js';
import type { ProductionTabPluginId } from './catalog.js';

export const tabPluginLoaders = {
  video: () => import('./video/activate.js'),
} satisfies Record<ProductionTabPluginId, TabPluginLoader>;
