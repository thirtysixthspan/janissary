import React from 'react';

// Overlay shown when an unprefixed command can't be routed confidently (server-driven). Lists the
// candidate routes (shell / db per open connection / acp); Up/Down move the selection, Return runs
// the chosen route, Escape cancels — handled by App's key handler. A row can also be clicked.
type Props = { cmd: string; choices: string[]; selected: number; onPick: (index: number) => void };

export function RouteChooser({ cmd, choices, selected, onPick }: Props) {
  return (
    <div className="picker">
      <div className="picker-title">route: {cmd}</div>
      {choices.map((label, i) => (
        <div
          key={i}
          className={`picker-row${i === selected ? ' selected' : ''}`}
          onClick={() => onPick(i)}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
