import { homedir } from 'node:os';
import path from 'node:path';
import { resolveExactApplicationCommand, resolveApplicationCommand, listApplicationCommands } from '../application-commands.js';
import { readCommandSettings, writeCommandSettings } from './settings-file.js';
import type {
  CommandSetting, CommandSettingsEdit, CommandSettingsRead, CommandSettingsSnapshot,
} from './settings-types.js';

type Listener = (snapshot: CommandSettingsSnapshot) => void;
type EditResult = Readonly<{ ok: boolean; message?: string }>;

export class NativeCommandSettingsManager {
  private snapshot: CommandSettingsSnapshot;
  private listeners = new Set<Listener>();
  private readonly root: string;
  private readonly home: string;

  constructor(root = process.cwd(), home = homedir()) {
    this.root = root;
    this.home = home;
    this.snapshot = this.createSnapshot(readCommandSettings(root, home));
  }

  current(): CommandSettingsSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
  }

  refresh(): CommandSettingsSnapshot {
    this.publish(this.createSnapshot(readCommandSettings(this.root, this.home)));
    return this.snapshot;
  }

  async edit({ name, setting }: CommandSettingsEdit): Promise<EditResult> {
    const resolved = resolveExactApplicationCommand(name);
    if (!resolved) return { ok: false, message: `Unknown application command: ${name}.` };
    const read = readCommandSettings(this.root, this.home);
    if (read.unusablePath) {
      return { ok: false, message: `commands.json at ${read.unusablePath} is unusable — fix the file before editing commands.` };
    }
    const canonical = resolved.name;
    const current = read.values[canonical] ?? { enabled: true, agentAccess: true };
    const next: CommandSetting = { ...current, ...setting };
    const values = { ...read.values, [canonical]: next };
    const destination = read.source === 'default'
      ? path.join(this.home, '.janissary', 'commands.json')
      : read.path;
    if (!writeCommandSettings(destination, values)) {
      return { ok: false, message: `Could not write commands.json at ${destination}.` };
    }
    this.publish(this.createSnapshot({
      values,
      source: read.source === 'project' ? 'project' : 'home',
      path: destination,
      ...(read.problem !== undefined && { problem: read.problem }),
    }));
    return { ok: true };
  }

  private createSnapshot(read: CommandSettingsRead): CommandSettingsSnapshot {
    const rows = listApplicationCommands();
    const byName = new Map(rows.map((row) => [row.name, row]));
    const settings = new Map(rows.map(({ name }) => [name, read.values[name] ?? { enabled: true, agentAccess: true }]));
    const parentName = (name: string): string | undefined => {
      const parent = byName.get(name)?.parent;
      return parent === undefined ? undefined : resolveApplicationCommand(parent)?.name ?? parent;
    };
    const isEnabled = (name: string, seen = new Set<string>()): boolean => {
      if (seen.has(name)) return true;
      seen.add(name);
      const value = settings.get(name);
      const parent = parentName(name);
      return (value?.enabled ?? true) && (!parent || isEnabled(parent, seen));
    };
    const isAgentEnabled = (name: string, seen = new Set<string>()): boolean => {
      const row = byName.get(name);
      if (!row) return true;
      if (seen.has(name)) return true;
      seen.add(name);
      const value = settings.get(name);
      const own = row.nativeTool === undefined || (value?.agentAccess ?? true);
      const parentCommand = parentName(name);
      const parent = parentCommand ? isAgentEnabled(parentCommand, seen) : true;
      return own && parent;
    };
    return {
      commands: rows.map((row) => ({
        ...row,
        ...(settings.get(row.name) ?? { enabled: true, agentAccess: true }),
        effectiveEnabled: isEnabled(row.name),
        effectiveAgentAccess: isEnabled(row.name) && isAgentEnabled(row.name),
      })),
      source: read.source,
      path: read.path,
      ...(read.problem !== undefined && { problem: read.problem }),
    };
  }

  private publish(snapshot: CommandSettingsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
