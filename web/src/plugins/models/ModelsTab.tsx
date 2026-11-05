import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import type { ModelRow, ModelsPayload } from '@shared/plugins/models/shared';
import { ConfirmDialog, PluginActionsHeader, type TabPluginClientCapabilities } from '../api';
import { ModelRowView } from './ModelRow';

export function ModelsTab({
  payload,
  capabilities,
}: {
  payload: ModelsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const [pending, setPending] = useState<ModelRow | null>(null);
  const narrow = capabilities.dock !== null;
  const modelCount = payload.groups.reduce((count, group) => count + group.rows.length, 0);

  return (
    <div className={`models-tab plugin-tab${narrow ? ' models-tab-narrow' : ''}`} data-doc-shot="models-tab">
      <PluginActionsHeader className="plugin-meta models-header">
        <span className="plugin-actions">
          <button
            type="button"
            title="Refresh"
            aria-label="Refresh"
            disabled={payload.refreshing}
            onClick={() => { void capabilities.intent('refresh', {}); }}
          >
            <FontAwesomeIcon icon={faRotate} spin={payload.refreshing} />
          </button>
          {capabilities.splitAction}
        </span>
      </PluginActionsHeader>
      {modelCount === 0 && <div className="models-empty">No models</div>}
      {modelCount > 0 && !narrow && (
        <div className="models-columns" aria-hidden="true">
          <span>Model</span>
          <span>Name</span>
          <span>Harness</span>
          <span />
        </div>
      )}
      <div className="models-groups">
        {payload.groups.map((group, groupIndex) => (
          <section className="models-group" key={`${group.label}:${groupIndex}`}>
            <h2 className="models-group-heading">{group.label}</h2>
            {group.rows.map((row) => (
              <ModelRowView
                key={`${row.harness}:${row.id}`}
                row={row}
                narrow={narrow}
                onDelete={() => { setPending(row); }}
              />
            ))}
          </section>
        ))}
      </div>
      {pending && (
        <ConfirmDialog
          title={`Delete ${pending.id}?`}
          confirmLabel="Delete"
          onCancel={() => { setPending(null); }}
          onConfirm={() => {
            void capabilities.intent('delete', { harness: pending.harness, id: pending.id });
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
