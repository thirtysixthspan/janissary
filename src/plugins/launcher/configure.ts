import type { TabPluginServerCapabilities } from '../api.js';
import { createDefaultLauncherFile } from './commands-file.js';
import {
  CONFIGURE_INTENT_ID,
  isRunCommandIntent,
  type LauncherRunCommandIntent,
} from './shared.js';

export function configureLauncherFile(filePath: string, capabilities: TabPluginServerCapabilities) {
  createDefaultLauncherFile(filePath);
  return capabilities.dispatchLineWithOutput(`edit ${filePath}`);
}

export function configureIntent(filePath: () => string) {
  return {
    payload: isRunCommandIntent,
    run: (_tab: unknown, payload: LauncherRunCommandIntent, capabilities: TabPluginServerCapabilities) => {
      if (payload.id !== CONFIGURE_INTENT_ID) return null;
      return configureLauncherFile(filePath(), capabilities);
    },
  };
}
