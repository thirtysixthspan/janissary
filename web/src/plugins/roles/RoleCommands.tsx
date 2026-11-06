import React, { type RefObject } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { CommandPicker } from './CommandPicker';
import { canAddRoleCommand, orderedRoleCommands, availableRoleCommands } from './role-commands';

export function RoleCommands({
  roleName, commands, vocabulary, headingId, headingRef, picker, onAdd, onRemove,
}: {
  roleName: string;
  commands: readonly string[];
  vocabulary: readonly string[];
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  picker: {
    open: boolean;
    openerRef: RefObject<HTMLButtonElement | null>;
    firstControlRef: RefObject<HTMLSelectElement | null>;
    openPicker(): void;
    closePicker(): void;
    onOpenerFocus(): void;
    onOpenerBlur(event: React.FocusEvent<HTMLButtonElement>): void;
  };
  onAdd(command: string): void;
  onRemove(command: string): void;
}) {
  const available = availableRoleCommands(commands, vocabulary);
  const showAdd = canAddRoleCommand(commands, vocabulary);
  const ordered = orderedRoleCommands(commands, vocabulary);
  const pickerControl = showAdd ? (
    picker.open ? (
      <CommandPicker
        roleName={roleName}
        commands={available}
        firstControlRef={picker.firstControlRef}
        onAdd={(command) => {
          onAdd(command);
          picker.closePicker();
        }}
        onCancel={picker.closePicker}
      />
    ) : (
      <button
        ref={picker.openerRef}
        type="button"
        className="roles-add-command"
        onFocus={picker.onOpenerFocus}
        onBlur={picker.onOpenerBlur}
        onClick={picker.openPicker}
      >
        <FontAwesomeIcon icon={faPlus} /> Add command
      </button>
    )
  ) : null;

  return (
    <section className="roles-section">
      <h3
        id={headingId}
        className="roles-section-heading"
        aria-label={`Commands of role ${roleName}`}
        ref={headingRef}
        tabIndex={-1}
      >
        Commands
      </h3>
      <ul className="roles-entries" aria-labelledby={headingId}>
        {ordered.length === 0 ? <li className="roles-empty-row">No commands</li> : null}
        {ordered.map((command, index) => {
          const unknown = !vocabulary.includes(command);
          return (
            <li
              key={`${command}:${index}`}
              className={unknown ? 'roles-entry roles-entry-missing roles-command-entry' : 'roles-entry roles-command-entry'}
              title={unknown ? 'Not a native command' : undefined}
            >
              <span className="roles-command-text">{command}</span>
              <button
                type="button"
                className="roles-icon"
                title={`Remove ${command}`}
                aria-label={`Remove ${command}`}
                onClick={() => onRemove(command)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </li>
          );
        })}
      </ul>
      {pickerControl}
    </section>
  );
}
