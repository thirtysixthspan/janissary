import type { FilesTabState } from './state.js';

export interface BasePort {
  states: Map<string, FilesTabState>;
  watchDir(label: string, absDir: string, relPath: string): void;
  unwatchDir(state: FilesTabState, relPath: string): void;
  rebuild(label: string): void;
  refreshGit(label: string): void;
}
