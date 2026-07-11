import React from 'react';

// The `profile launch` overlay listing the project's available profiles. Up/Down move the
// selection, Enter populates the command line (not submitting it, like the `tasks` picker),
// Escape closes — handled by App's key handler; a row can also be clicked to pick it.
type Properties = { profiles: string[]; selected: number; onPick: (name: string) => void };

export function ProfilePicker({ profiles, selected, onPick }: Properties) {
  return (
    <div className="picker" data-doc-shot="profile-overlay">
      <div className="picker-title">profiles</div>
      {profiles.length === 0 ? (
        <div className="picker-row picker-empty">(no profiles)</div>
      ) : (
        profiles.map((name, index) => (
          <div
            key={name}
            className={`picker-row${index === selected ? ' selected' : ''}`}
            onClick={() => onPick(name)}
          >
            {name}
          </div>
        ))
      )}
    </div>
  );
}
