import type { Managers } from '../managers.js';

export type CommandManagers = Managers;

export interface Command {
  name: string;
  match: (command: string) => boolean;
  run: (command: string, tab: { label: string; index: number }, managers: CommandManagers) => void;
}
