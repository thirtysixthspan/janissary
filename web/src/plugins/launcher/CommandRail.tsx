import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { LauncherCommand } from '@shared/plugins/launcher/shared';
import { nextListSelection, useListSelection, type ListRowClick, type ListSelection } from '../api';
import { launchIcon } from './launcher-icons';

// A click highlights and confirms in one step; the row opens on the second click of an already
// highlighted one. One rule for every list here, because "click twice to run" is what a terminal user's
// muscle memory expects and a rail that ran on every click would fire while the user is still reading.
function openOnConfirm(index: number, confirmed: number | null): ListRowClick {
  return { selected: index, opens: confirmed === index };
}

// The icon names this build already reported, so a repaint is not a second notification for the same
// typo — the row redraws whenever the host republishes, which is often.
const reportedIcons = new Set<string>();

// One row of the command rail. The label is the user's own wording for the command, so the row shows
// exactly what `launcher.json` says and nothing derived from the command itself; the command line is
// the tooltip, because it is what actually runs.
export function LauncherCommandRow({ entry, index, selection, onOpen, onUnknownIcon }: {
  entry: LauncherCommand;
  index: number;
  selection: ListSelection;
  onOpen(index: number): void;
  onUnknownIcon?(icon: string): void;
}) {
  const { icon, known } = launchIcon(entry.icon);
  if (!known && !reportedIcons.has(entry.icon)) {
    reportedIcons.add(entry.icon);
    onUnknownIcon?.(entry.icon);
  }
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

// The command list, its selection, and the Enter key that runs the highlighted row. Kept apart from the
// rail so the shared list-selection helper stays the one thing that answers a key.
export function LauncherCommandList({ commands, listRef, onOpen, onUnknownIcon }: {
  commands: readonly LauncherCommand[];
  listRef: React.RefObject<HTMLDivElement | null>;
  onOpen(index: number): void;
  onUnknownIcon?(icon: string): void;
}) {
  const selection = useListSelection(commands.length);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (selection.navigate(event.key, nextListSelection)) { event.preventDefault(); return; }
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
        <LauncherCommandRow
          key={entry.id}
          entry={entry}
          index={index}
          selection={selection}
          onOpen={onOpen}
          onUnknownIcon={onUnknownIcon}
        />
      ))}
    </div>
  );
}
