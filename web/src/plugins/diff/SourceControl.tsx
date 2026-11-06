import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCodeCommit, faLayerGroup, faListCheck, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { DIFF_SOURCES, type DiffSource } from '@shared/plugins/diff/shared';

const SOURCE_VIEW: Record<DiffSource, { icon: IconDefinition; name: string }> = {
  all: { icon: faLayerGroup, name: 'all changes' },
  staged: { icon: faListCheck, name: 'staged changes' },
  commit: { icon: faCodeCommit, name: 'last commit' },
};

export function nextSource(source: DiffSource): DiffSource {
  return DIFF_SOURCES[(DIFF_SOURCES.indexOf(source) + 1) % DIFF_SOURCES.length];
}

// The header button that cycles which changes the tab reads. The icon names the source shown now and
// the tooltip names the one a click switches to; the server owns the choice, so the button only asks.
export function SourceControl({ source, onChange }: { source: DiffSource; onChange(next: DiffSource): void }) {
  const next = nextSource(source);
  return (
    <button
      type="button"
      className="diff-source"
      data-source={source}
      aria-label="Change source"
      title={`Showing ${SOURCE_VIEW[source].name}. Switch to ${SOURCE_VIEW[next].name}`}
      onClick={() => onChange(next)}
    >
      <FontAwesomeIcon icon={SOURCE_VIEW[source].icon} />
    </button>
  );
}
