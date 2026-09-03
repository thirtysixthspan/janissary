import type { TabPluginLoader } from './api.js';
import type { ProductionTabPluginId } from './catalog.js';

export const tabPluginLoaders = {
  audio: () => import('./audio/activate.js'),
  conversations: () => import('./conversations/activate.js'),
  image: () => import('./image/activate.js'),
  markdown: () => import('./markdown/activate.js'),
  page: () => import('./page/activate.js'),
  schedules: () => import('./schedules/activate.js'),
  video: () => import('./video/activate.js'),
} satisfies Record<ProductionTabPluginId, TabPluginLoader>;
