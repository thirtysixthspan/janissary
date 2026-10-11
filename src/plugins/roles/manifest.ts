import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { ROLES_PAYLOAD_SCHEMA_VERSION } from './shared.js';

// The roles tab: a configuration tool mapping named roles to ordered harness/model/effort entries,
// stored in `~/.janissary/roles.json` and overridden wholesale by a project's `.janissary/roles.json`.
// It opens on no file — it claims no extensions and is reached only through its own `roles` command —
// and it reads the harness launch catalog through `harnessLaunchCatalog`, because the plugin import
// boundary closes the route to the harness subsystem itself.
export const rolesManifest = {
  id: 'roles',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: ROLES_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'roles',
  fileExtensions: {},
  command: 'roles',
  capabilities: [
    'openOrFocusTab',
    'updateTab',
    'originTab',
    'harnessLaunchCatalog',
    'rejectRequest',
    'reportFailure',
  ],
} as const satisfies TabPluginDeclaration;
