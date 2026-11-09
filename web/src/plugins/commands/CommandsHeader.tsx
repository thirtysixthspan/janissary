import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import type { CommandsPayload } from '@shared/plugins/commands/shared';
import { PluginActionsHeader, type TabPluginClientCapabilities } from '../api';

export function CommandsHeader({
  payload,
  capabilities,
}: {
  payload: CommandsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const docked = capabilities.dock !== null;
  const source = (
    <span className="commands-source">
      {payload.source === 'default' ? 'No commands file in effect' : `Editing ${payload.path}`}
    </span>
  );
  return (
    <>
      {docked ? <div className="commands-source-row">{source}</div> : null}
      <PluginActionsHeader className="plugin-meta commands-header">
        {docked ? null : source}
        <span className="plugin-actions">
          <button
            type="button"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => { void capabilities.intent('refresh', {}); }}
          >
            <FontAwesomeIcon icon={faRotate} />
          </button>
          {capabilities.splitAction}
        </span>
      </PluginActionsHeader>
    </>
  );
}
