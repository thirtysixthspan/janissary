import type { TabPluginDeclaration } from './api.js';
import { audioManifest } from './audio/manifest.js';
import { imageManifest } from './image/manifest.js';
import { markdownManifest } from './markdown/manifest.js';
import { pageManifest } from './page/manifest.js';
import { schedulesManifest } from './schedules/manifest.js';
import { videoManifest } from './video/manifest.js';

export const tabPluginCatalog = [
  audioManifest, imageManifest, markdownManifest, pageManifest, schedulesManifest, videoManifest,
] as const satisfies readonly TabPluginDeclaration[];
export type ProductionTabPluginId = (typeof tabPluginCatalog)[number]['id'];
