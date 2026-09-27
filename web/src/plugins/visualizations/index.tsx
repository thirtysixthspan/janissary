import '../shared.css';
import './visualizations.css';

import type { VisualizationsPayload } from '@shared/plugins/visualizations/shared';
import type { TabPluginClientCapabilities } from '../api';
import { VisualizationList } from './VisualizationList';
import { VisualizationTab } from './VisualizationTab';

// The two payload kinds are two different views of the same feature, so the entry dispatches on the
// kind and each component receives a payload its own guard has already narrowed. Nothing here asserts a
// type: the registry proved it before this ran.
function VisualizationsPlugin({
  payload,
  capabilities,
}: {
  payload: VisualizationsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  if (payload.kind === 'list') {
    return <VisualizationList payload={payload} capabilities={capabilities} />;
  }
  return <VisualizationTab payload={payload} capabilities={capabilities} />;
}

export default VisualizationsPlugin;
export { isVisualizationsPayload as isPayload } from '@shared/plugins/visualizations/shared';
