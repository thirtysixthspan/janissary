import React, { useEffect, useState, type KeyboardEvent } from 'react';

export function CommandPicker({
  roleName, commands, firstControlRef, onAdd, onCancel,
}: {
  roleName: string;
  commands: readonly string[];
  firstControlRef: React.RefObject<HTMLSelectElement | null>;
  onAdd(command: string): void;
  onCancel(): void;
}) {
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (selected !== '' && !commands.includes(selected)) setSelected('');
  }, [commands, selected]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  };

  return (
    <div className="roles-picker" onKeyDown={handleKeyDown}>
      <select
        ref={firstControlRef}
        value={selected}
        aria-label={`Command to add to role ${roleName}`}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">command…</option>
        {commands.map((command) => <option key={command} value={command}>{command}</option>)}
      </select>
      <button type="button" onClick={() => onAdd(selected)} disabled={!selected}>Add</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}
