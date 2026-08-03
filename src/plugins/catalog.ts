import type { TabPluginDeclaration } from './api.js';
import { videoManifest } from './video/manifest.js';

export const tabPluginCatalog = [videoManifest] as const satisfies readonly TabPluginDeclaration[];
export type ProductionTabPluginId = (typeof tabPluginCatalog)[number]['id'];
