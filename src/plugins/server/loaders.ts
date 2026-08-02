import type { TabPluginServerLoader } from '../api.js';

export const serverPluginLoaders: Readonly<Record<string, TabPluginServerLoader>> = {
  video: () => import('../video/server/activate.js'),
};
