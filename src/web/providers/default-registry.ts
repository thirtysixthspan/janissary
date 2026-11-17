import { webProviderCatalog } from './catalog.js';
import { createProviderRegistry } from './registry.js';

export const webProviderRegistry = createProviderRegistry(webProviderCatalog);
