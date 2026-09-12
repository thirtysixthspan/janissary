import type { FilesTabState } from './state.js';

export interface BasePort {
  states: Map<string, FilesTabState>;
  watchDir(label: string, absDir: string, relPath: string): void;
  unwatchDir(state: FilesTabState, relPath: string): void;
  rebuild(label: string): void;
  refreshGit(label: string): void;
}

// The members both ports take from `FileNavigatorManager` as bound closures. Derived from
// `BasePort` so a signature change reaches the manager rather than drifting from it, and passed as
// one record so `rebuild` and `refreshGit` — identically typed — cannot be transposed.
export type PortClosures = Pick<BasePort, 'watchDir' | 'unwatchDir' | 'rebuild' | 'refreshGit'>;
