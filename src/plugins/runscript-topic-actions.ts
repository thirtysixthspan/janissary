import { statSync } from 'node:fs';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { TabPluginTopicAction } from './api.js';
import { runRunscriptNow } from '../commands/execute.js';
import { notify } from '../notifications/index.js';
import { errorText } from '../error-text.js';
import { editorSizeRefusal } from '../openers/editor.js';
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

function reportCause(action: string, error: unknown, name?: string): void {
  const subject = name === undefined ? action : `${action} "${name}"`;
  process.stderr.write(`Runscript ${subject} failed: ${errorText(error)}\n`);
}

function postRunFailure(managers: Managers, origin: string, name: string): void {
  try {
    post(managers, origin, failed('run', name));
  } catch (error) {
    reportCause('execute', error, name);
  }
}

function untitledName(error: unknown): string {
  const name = error instanceof Error && 'runscriptName' in error ? error.runscriptName : undefined;
  return typeof name === 'string' ? name : 'untitled';
}

function editorRefusal(target: string): string | undefined {
  let bytes: number;
  try { bytes = statSync(target).size; } catch { return undefined; }
  return editorSizeRefusal(path.basename(target), bytes);
}

function openRunscript(managers: Managers, origin: string, command: string, name: string): void {
  const target = runscriptFilePath(managers.tab.launchDir, name);
  const refusal = editorRefusal(target);
  if (refusal !== undefined) {
    post(managers, origin, refusal);
    return;
  }
  managers.openFile.edit(command, target, origin);
}

function deleteOne(managers: Managers, origin: string, name: string): void {
  try {
    if (!deleteRunscript(managers.tab.launchDir, name)) post(managers, origin, missing(name));
  } catch (error) {
    reportCause('delete', error, name);
    post(managers, origin, failed('delete', name));
  }
}

function cloneOne(managers: Managers, origin: string, name: string): void {
  let copy: string | undefined;
  try {
    copy = cloneRunscript(managers.tab.launchDir, name);
  } catch (error) {
    reportCause('clone', error, name);
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
    const attempted = untitledName(error);
    reportCause('create', error, attempted);
    post(managers, origin, failed('create', attempted));
    return;
  }
  openRunscript(managers, origin, `create script ${name}`, name);
}

function openOne(managers: Managers, origin: string, name: string): void {
  let exists: boolean;
  try {
    exists = readRunscript(managers.tab.launchDir, name).exists;
  } catch (error) {
    reportCause('open', error, name);
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
  } catch (error) {
    reportCause('ensureDirectory', error);
    post(managers, origin, 'Could not use the runscripts directory.');
  }
}

export function runscriptTopicAction(managers: Managers, action: TabPluginTopicAction): void {
  if (action.topic !== 'runscripts') return;
  if ('name' in action && !isRunscriptName(action.name)) return;
  const { origin } = action;
  switch (action.action) {
    case 'execute': {
      void runRunscriptNow(managers, action.name)
        .then((text) => {
          if (text !== undefined) post(managers, origin, text);
        })
        .catch((error: unknown) => {
          reportCause('execute', error, action.name);
          postRunFailure(managers, origin, action.name);
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
