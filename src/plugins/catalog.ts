import type { TabPluginDeclaration } from './api.js';
import { imageManifest } from './image/manifest.js';
import { videoManifest } from './video/manifest.js';

export const tabPluginCatalog = [imageManifest, videoManifest] as const satisfies readonly TabPluginDeclaration[];
export type ProductionTabPluginId = (typeof tabPluginCatalog)[number]['id'];
