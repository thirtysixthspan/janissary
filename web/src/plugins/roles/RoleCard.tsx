import React, { useEffect, useId, useRef } from 'react';
import { errorText } from '@shared/error-text';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { CommandRestriction, Role } from '@shared/plugins/roles/shared';
import type { TabPluginClientCapabilities } from '../api';
import {
  allowDrop, dragEnd, dragRole, dropOnRole,
} from './roles-dnd';
import { useRoleDraft } from './useRoleDraft';
import { RoleCommands } from './RoleCommands';
import { RoleModels, type EntryDrop } from './RoleModels';
import { useRolePickerFocus } from './useRolePickerFocus';

type Properties = {
  role: Role;
  index: number;
  efforts: readonly string[];
  models: Record<string, string[]>;
  nativeCommands: readonly string[];
  commandRestrictions: Readonly<Record<string, CommandRestriction>>;
  capabilities: TabPluginClientCapabilities;
  onRefusal: (message: string | null) => void;
};

// One role card: role-level drafts and intents stay here while the model and command sections render
// their own rows and pickers.
export function RoleCard({ role, index, efforts, models, nativeCommands, commandRestrictions, capabilities, onRefusal }: Properties) {
  const nameDraft = useRoleDraft(role.name);
  const descriptionDraft = useRoleDraft(role.description);
  const headingIds = useId();
  const modelsHeadingRef = useRef<HTMLHeadingElement>(null);
  const commandsHeadingRef = useRef<HTMLHeadingElement>(null);
  const modelsPicker = useRolePickerFocus(true, modelsHeadingRef);
  const commandsPicker = useRolePickerFocus(
    nativeCommands.some((command) => !role.commands.includes(command)),
    commandsHeadingRef,
  );
  const [drop, setDrop] = React.useState(false);

  useEffect(() => {
    if (nameDraft.conflicted) onRefusal(`The name of "${role.name}" changed elsewhere — showing the stored one.`);
    if (descriptionDraft.conflicted) {
      onRefusal(`The description of "${role.name}" changed elsewhere — showing the stored one.`);
    }
  }, [descriptionDraft.conflicted, nameDraft.conflicted, onRefusal, role.name]);

  const raise = (intent: string, payload: Record<string, unknown>) => {
    onRefusal(null);
    void capabilities.intent(intent, payload).catch((error: unknown) => onRefusal(errorText(error)));
  };

  const commitName = () => {
    const change = nameDraft.commit();
    if (change === null) return;
    const trimmed = change.text.trim();
    if (trimmed.length === 0 || trimmed === role.name) nameDraft.revert();
    else raise('rename-role', { name: role.name, next: trimmed });
  };

  const commitDescription = () => {
    const change = descriptionDraft.commit();
    if (change !== null) {
      raise('describe-role', { name: role.name, description: change.text, expected: change.baseline });
    }
  };

  const addPicked = (harness: string, model: string, effort: string) => {
    raise('add-entry', { role: role.name, entry: { harness, model, ...(effort && { effort }) } });
    modelsPicker.closePicker();
  };

  const land = (result: EntryDrop) => {
    setDrop(false);
    if (result) raise(result.intent, result.payload);
  };

  return (
    <div
      className={drop ? 'roles-card roles-drop' : 'roles-card'}
      onDragOver={(event) => {
        allowDrop(event, (drag) => drag.kind === 'role');
        if (event.defaultPrevented) setDrop(true);
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(event) => land(dropOnRole(event, role.name, index))}
    >
      <div className="roles-card-head">
        <span
          className="roles-grip"
          draggable
          onDragStart={(event) => dragRole(event, role.name)}
          onDragEnd={dragEnd}
          title="Drag to reorder"
          aria-hidden
        >
          &#8942;&#8942;
        </span>
        <input
          className="roles-name"
          value={nameDraft.value}
          aria-label={`Name of role ${role.name}`}
          onChange={(event) => nameDraft.set(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') nameDraft.revert();
          }}
        />
        <button
          type="button"
          className="roles-icon"
          title={`Delete role ${role.name}`}
          onClick={() => raise('delete-role', { name: role.name })}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>
      <input
        className="roles-description"
        value={descriptionDraft.value}
        placeholder="Description"
        aria-label={`Description of role ${role.name}`}
        onChange={(event) => descriptionDraft.set(event.target.value)}
        onBlur={commitDescription}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          else if (event.key === 'Escape') descriptionDraft.revert();
        }}
      />
      <RoleModels
        roleName={role.name}
        entries={role.entries}
        efforts={efforts}
        models={models}
        headingId={`${headingIds}-models`}
        headingRef={modelsHeadingRef}
        picker={modelsPicker}
        onAdd={addPicked}
        onRemove={(position, expected) => raise('remove-entry', { role: role.name, index: position, expected })}
        onSetEffort={(position, expected, effort) => raise('set-entry-effort', {
          role: role.name, index: position, expected, effort,
        })}
        onDropEntry={land}
      />
      <RoleCommands
        roleName={role.name}
        commands={role.commands}
        vocabulary={nativeCommands}
        commandRestrictions={commandRestrictions}
        headingId={`${headingIds}-commands`}
        headingRef={commandsHeadingRef}
        picker={commandsPicker}
        onAdd={(command) => raise('add-command', { role: role.name, command })}
        onRemove={(command) => raise('remove-command', { role: role.name, command })}
      />
    </div>
  );
}
