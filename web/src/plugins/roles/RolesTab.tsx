import React, { useState } from 'react';
import type { RolesPayload } from '@shared/plugins/roles/shared';
import type { TabPluginClientCapabilities } from '../api';
import { RoleCard } from './RoleCard';
import { useRoleCreation } from './useRoleCreation';

type Properties = { payload: RolesPayload; capabilities: TabPluginClientCapabilities };

// The roles tab edits names, descriptions, efforts, and order in place; every edit is one intent,
// so nothing shown here is local state the file does not hold.
export function RolesTab({ payload, capabilities }: Properties) {
  const { roles, source, path, problem, catalog, nativeCommands } = payload;
  const [refusal, setRefusal] = useState<string | null>(null);
  const { adding, newName, openNewRole, typeName, closeNewRole, commitNewRole } = useRoleCreation(
    capabilities.intent,
    setRefusal,
  );

  return (
    <div className="roles-tab" data-doc-shot="roles-tab">
      <div className="roles-list">
        <div className="roles-source">
          {source === 'default' ? 'No roles file in effect' : `Editing ${path}`}
        </div>
        {problem ? <div className="roles-problem">{problem}</div> : null}
        {refusal ? <div className="roles-refusal">{refusal}</div> : null}
        {roles.length === 0 && !adding ? <div className="roles-empty">No roles yet.</div> : null}
        {roles.map((role, index) => (
          <RoleCard
            key={role.name}
            role={role}
            index={index}
            efforts={catalog.efforts}
            models={catalog.models}
            nativeCommands={nativeCommands}
            capabilities={capabilities}
            onRefusal={setRefusal}
          />
        ))}
        {adding ? (
          <div className="roles-card roles-new">
            <input
              autoFocus
              value={newName}
              placeholder="Role name"
              aria-label="New role name"
              onChange={(event) => typeName(event.target.value)}
              onBlur={() => void commitNewRole()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                else if (event.key === 'Escape') closeNewRole();
              }}
            />
          </div>
        ) : (
          <button type="button" className="roles-add-role" onClick={openNewRole}>
            Add role
          </button>
        )}
      </div>
    </div>
  );
}
