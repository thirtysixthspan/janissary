import type { Managers } from '../managers.js';
import type { TabPluginTopicAction } from './api.js';
import { runRunscriptNow } from '../commands/execute.js';
import { notify } from '../notifications/index.js';
import { isRunscriptName } from '../schedule/system/runscript.js';
import {
  cloneRunscript,
  deleteRunscript,
  ensureScriptsDirectory,
  newUntitledRunscript,
  readRunscript,
  runscriptFilePath,
} from '../schedule/system/runscript-files.js';

function post(managers: Managers, origin: string, text: string): void {
  notify(managers, 'plugin-note', origin, text);
}

function missing(name: string): string {
  return `No runscript named "${name}".`;
}

function failed(verb: string, name: string): string {
  return `Could not ${verb} runscript "${name}".`;
}

function untitledName(error: unknown): string {
  const name = error instanceof Error && 'runscriptName' in error ? error.runscriptName : undefined;
  return typeof name === 'string' ? name : 'untitled';
}

function openRunscript(managers: Managers, origin: string, command: string, name: string): void {
  managers.openFile.edit(command, runscriptFilePath(managers.tab.launchDir, name), origin);
}

function deleteOne(managers: Managers, origin: string, name: string): void {
  try {
    if (!deleteRunscript(managers.tab.launchDir, name)) post(managers, origin, missing(name));
  } catch {
    post(managers, origin, failed('delete', name));
  }
}

function cloneOne(managers: Managers, origin: string, name: string): void {
  let copy: string | undefined;
  try {
    copy = cloneRunscript(managers.tab.launchDir, name);
  } catch {
    post(managers, origin, failed('clone', name));
    return;
  }
  if (copy === undefined) {
    post(managers, origin, missing(name));
    return;
  }
  openRunscript(managers, origin, `edit ${copy}`, copy);
}

function createOne(managers: Managers, origin: string): void {
  let name: string;
  try {
    name = newUntitledRunscript(managers.tab.launchDir);
  } catch (error) {
    post(managers, origin, failed('create', untitledName(error)));
    return;
  }
  openRunscript(managers, origin, `create script ${name}`, name);
}

function openOne(managers: Managers, origin: string, name: string): void {
  let exists: boolean;
  try {
    exists = readRunscript(managers.tab.launchDir, name).exists;
  } catch {
    post(managers, origin, failed('read', name));
    return;
  }
  if (!exists) {
    post(managers, origin, missing(name));
    return;
  }
  openRunscript(managers, origin, `edit ${name}`, name);
}

function ensureDirectory(managers: Managers, origin: string): void {
  try {
    ensureScriptsDirectory(managers.tab.launchDir);
  } catch {
    post(managers, origin, 'Could not use the runscripts directory.');
  }
}

export function runscriptTopicAction(managers: Managers, action: TabPluginTopicAction): void {
  if (action.topic !== 'runscripts') return;
  if ('name' in action && !isRunscriptName(action.name)) return;
  const { origin } = action;
  switch (action.action) {
    case 'execute': {
      void runRunscriptNow(managers, action.name).then((text) => {
        if (text !== undefined) post(managers, origin, text);
      });
      return;
    }
    case 'delete': { deleteOne(managers, origin, action.name); return; }
    case 'clone': { cloneOne(managers, origin, action.name); return; }
    case 'create': { createOne(managers, origin); return; }
    case 'open': { openOne(managers, origin, action.name); return; }
    case 'ensureDirectory': { ensureDirectory(managers, origin); return; }
  }
}
