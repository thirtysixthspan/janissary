import type { TabPluginClientLoader } from '../api';

export const clientPluginLoaders: Readonly<Record<string, TabPluginClientLoader>> = {
  video: () => import('../video/client/activate'),
};
