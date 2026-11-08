import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { readJsonConfigFile } from '../plugins/files.js';
import { listApplicationCommands } from '../application-commands.js';
import { decodeCommandSettings, normalizeCommandName } from './decode.js';
import type { CommandSetting, CommandSettingsRead } from './settings-types.js';

const FILE_NAME = 'commands.json';

function readAt(filePath: string):
  { ok: true; values: Record<string, CommandSetting>; malformed: boolean } | { ok: false; problem: string } {
  const read = readJsonConfigFile(filePath, FILE_NAME, (parsed, text) =>
    decodeCommandSettings(parsed, text), 'is unusable');
  if (read.problem !== undefined) return { ok: false, problem: read.problem };
  return { ok: true, values: read.value.values, malformed: read.value.malformed };
}

export function readCommandSettings(
  root: string,
  home = os.homedir(),
): CommandSettingsRead {
  const homePath = path.join(home, '.janissary', FILE_NAME);
  const projectPath = path.join(root, '.janissary', FILE_NAME);
  const candidates: Array<{ path: string; source: 'home' | 'project' }> = [];
  if (existsSync(projectPath)) candidates.push({ path: projectPath, source: 'project' });
  if (existsSync(homePath)) candidates.push({ path: homePath, source: 'home' });
  let problem: string | undefined;
  let brokenPath = projectPath;
  for (const candidate of candidates) {
    const read = readAt(candidate.path);
    if (!read.ok) {
      problem ??= read.problem;
      brokenPath = candidate.path;
      continue;
    }
    return {
      values: read.values, source: candidate.source, path: candidate.path,
      ...(problem !== undefined && { problem: `${problem} — showing the ${candidate.source} commands file.` }),
    };
  }
  if (problem !== undefined) {
    return {
      values: {}, source: 'default', path: brokenPath, unusablePath: brokenPath,
      problem: `${problem} — showing default commands.`,
    };
  }
  return { values: {}, source: 'default', path: homePath };
}

export function serializeCommandSettings(
  values: Readonly<Record<string, CommandSetting>>,
): string {
  const members = listApplicationCommands().map(({ name }) => {
    const setting = values[normalizeCommandName(name)] ?? { enabled: true, agentAccess: true };
    return [name, { enabled: setting.enabled, agentAccess: setting.agentAccess }] as const;
  });
  const object = Object.fromEntries(members);
  return `${JSON.stringify(object, undefined, 2)}\n`;
}

export function writeCommandSettings(filePath: string, values: Readonly<Record<string, CommandSetting>>): boolean {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    atomicWriteFile(filePath, serializeCommandSettings(values));
    return true;
  } catch {
    return false;
  }
}
