import type { Tab } from '../tab/types.js';

export type TabPluginOriginTab = {
  label: string;
  cwd: string;
  root: string;
  view?: Tab['view'];
  plugin?: string;
  workspace?: { dir: string; offline?: boolean };
  remote?: true;
  provisioning?: true;
} | null;
