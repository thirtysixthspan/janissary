import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { LauncherCommand } from '@shared/plugins/launcher/shared';
import { useListSelection, type ListRowClick, type ListSelection } from '../api';
import { launchIcon } from './launcher-icons';

// A click highlights and confirms in one step; the row opens on the second click of an already
// highlighted one. One rule for every list here, because "click twice to run" is what a terminal user's
// muscle memory expects and a rail that ran on every click would fire while the user is still reading.
function openOnConfirm(index: number, confirmed: number | null): ListRowClick {
  return { selected: index, opens: confirmed === index };
}

// One row of the command rail. The label is the user's own wording for the command, so the row shows
// exactly what `launcher.json` says and nothing derived from the command itself; the command line is
// the tooltip, because it is what actually runs.
export function LauncherCommandRow({ entry, index, selection, onOpen }: {
  entry: LauncherCommand;
  index: number;
  selection: ListSelection;
  onOpen(index: number): void;
}) {
  const { icon, known } = launchIcon(entry.icon);
  return (
    <button
      type="button"
      className={`launcher-command${selection.selected === index ? ' selected' : ''}`}
      data-index={index}
      role="option"
      aria-selected={selection.selected === index}
      title={entry.command}
      onClick={() => { if (selection.rowClicked(index, openOnConfirm)) onOpen(index); }}
    >
      <span className={`launcher-command-icon${known ? '' : ' fallback'}`}>
        <FontAwesomeIcon icon={icon} />
      </span>
      <span className="launcher-command-label">{entry.label}</span>
    </button>
  );
}

// Arrows step by one and stop at the ends, so holding a key settles on the last or first rather than
// cycling past it. Home and End jump. A list with no selection yet starts at the first row.
function listStep(length: number, selected: number | null, key: string): number | null {
  if (length === 0) return null;
  const at = selected ?? 0;
  if (key === 'ArrowDown') return Math.min(at + 1, length - 1);
  if (key === 'ArrowUp') return Math.max(at - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return selected;
}

// The command list, its selection, and the Enter key that runs the highlighted row. Kept apart from the
// rail so the shared list-selection helper stays the one thing that answers a key.
export function LauncherCommandList({ commands, listRef, onOpen }: {
  commands: readonly LauncherCommand[];
  listRef: React.RefObject<HTMLDivElement | null>;
  onOpen(index: number): void;
}) {
  const selection = useListSelection(commands.length);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (selection.navigate(event.key, listStep)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && selection.selected !== null) {
      event.preventDefault();
      onOpen(selection.selected);
    }
  };
  return (
    <div
      className="launcher-commands"
      ref={listRef}
      tabIndex={0}
      role="listbox"
      aria-label="Launch commands"
      onKeyDown={onKeyDown}
    >
      {commands.map((entry, index) => (
        <LauncherCommandRow key={entry.id} entry={entry} index={index} selection={selection} onOpen={onOpen} />
      ))}
    </div>
  );
}
