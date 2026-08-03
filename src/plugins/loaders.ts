import type { TabPluginLoader } from './api.js';
import type { ProductionTabPluginId } from './catalog.js';

export const tabPluginLoaders = {
  image: () => import('./image/activate.js'),
  video: () => import('./video/activate.js'),
} satisfies Record<ProductionTabPluginId, TabPluginLoader>;
