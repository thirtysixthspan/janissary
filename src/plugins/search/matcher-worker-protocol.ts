import type { MatcherModes } from './compile-matcher.js';
import type { SearchMatch } from './shared.js';

export type MatcherWorkerRequest = {
  id: number;
  query: string;
  modes: MatcherModes;
} & (
  | { operation: 'detect'; lines: string[] }
  | { operation: 'rows'; relPath: string; text: string }
);

export type MatcherWorkerResponse =
  | { id: number; result: boolean | SearchMatch[] }
  | { id: number; error: string };

export type MatcherWorker = {
  detect(lines: string[]): Promise<boolean>;
  rows(relPath: string, text: string): Promise<SearchMatch[]>;
  dispose(): void;
};
