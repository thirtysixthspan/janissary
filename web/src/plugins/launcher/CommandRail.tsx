import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { LauncherCommand } from '@shared/plugins/launcher/shared';
import { nextListSelection, useListSelection, type ListSelection } from '../api';
import { commandClickSelection } from './launcher-click';
import { launchIcon } from './launcher-icons';
import { useComposedListRef } from './list-ref';

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
      onClick={() => { if (selection.rowClicked(index, commandClickSelection)) onOpen(index); }}
    >
      <span className={`launcher-command-icon${known ? '' : ' fallback'}`}>
        <FontAwesomeIcon icon={icon} />
      </span>
      <span className="launcher-command-label">{entry.label}</span>
    </button>
  );
}

// The command list, its selection, and the Enter key that runs the highlighted row. Kept apart from the
// rail so the shared list-selection helper stays the one thing that answers a key.
export function LauncherCommandList({ commands, listRef, onToggleFocus, onOpen }: {
  commands: readonly LauncherCommand[];
  listRef: React.RefObject<HTMLDivElement | null>;
  onToggleFocus(): void;
  onOpen(index: number): void;
}) {
  const selection = useListSelection(commands.length);
  const composed = useComposedListRef(listRef, selection.listRef);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      onToggleFocus();
      return;
    }
    if (selection.navigate(event.key, nextListSelection)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && selection.selected !== null) {
      event.preventDefault();
      onOpen(selection.selected);
    }
  };
  return (
    <div
      className="launcher-commands"
      ref={composed}
      tabIndex={0}
      role="listbox"
      aria-label="Launch commands"
      onKeyDown={onKeyDown}
    >
      {commands.map((entry, index) => (
        <LauncherCommandRow
          key={entry.id}
          entry={entry}
          index={index}
          selection={selection}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
