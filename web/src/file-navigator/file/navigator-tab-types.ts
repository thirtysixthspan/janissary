import type React from 'react';
import type { FileNavigatorView } from '@shared/protocol';
import type { JanusClient } from '../../ws';
import type { CommandInputDropHandle } from '../../shared/drop-handles';

export type FileNavigatorTabProperties = {
  files: FileNavigatorView;
  client: JanusClient;
  index: number;
  // The navigator tab's label. Deletes, moves, pastes, and renames are addressed by it rather than
  // by `index`, so a tab closing ahead of this one cannot redirect them onto another tree.
  label: string;
  // The tab's current dock location (undefined means center). Drives the location-cycle
  // button's destination.
  dock?: 'left' | 'right';
  // Whether the tree grabs keyboard focus on mount. True for a center tab (the default); false
  // for a sidebar mount, where stealing focus would yank it away from the command bar every time
  // a dock move remounts the tree.
  autoFocus?: boolean;
  // The active tab's command bar imperative handle — only ever passed when this tree is docked
  // into a sidebar, where another tab's command bar can be a valid drop target alongside it.
  // Omitted for a center-mounted tree, which per Decision 4 never has a reachable command-bar
  // target regardless.
  dropRef?: React.RefObject<CommandInputDropHandle | null>;
  targetCwd?: string;
  onSplit?: () => void;
  // Classifier for the whole-selection Open/Edit fan-out: which paths, if any, Open and Edit
  // apply to when the clicked row belongs to the multi-row selection. Owned by the app shell,
  // so the navigator never names which plugin or file kind qualifies.
  multiOpen?: (paths: string[]) => string[] | null;
};
