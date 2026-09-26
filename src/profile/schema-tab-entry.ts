// The per-tab-kind half of the profile schema: what one entry of a profile's `tabs` array may carry,
// field by field, for each of the kinds `schema.ts` classifies. Extracted from `schema.ts` to keep
// both files under the file-size limit — see `ai/guidelines/code-guidelines.md` — and because these
// are only ever reached through the one `tabProblems` switch that names them.

import { checkField } from './schema-fields.js';

// The four file-navigator detail modes a `files` entry's `details` key may name.
const DETAIL_MODES = new Set(['name', 'size', 'modified', 'permissions']);

// `dock`, when present, must be exactly "left" or "right".
function checkDock(obj: Record<string, unknown>, loc: string): string[] {
  const dock = obj.dock;
  if (dock === undefined || (typeof dock === 'string' && ['left', 'right'].includes(dock))) return [];
  return [`${loc}: dock must be "left" or "right"`];
}

function checkPane(obj: Record<string, unknown>, loc: string): string[] {
  const pane = obj.pane;
  if (pane === undefined || (typeof pane === 'string' && ['left', 'right'].includes(pane))) return [];
  return [`${loc}: pane must be "left" or "right"`];
}

// `details`, when present, must name one of the four file-navigator detail modes.
function checkDetails(obj: Record<string, unknown>, loc: string): string[] {
  const details = obj.details;
  if (details === undefined || (typeof details === 'string' && DETAIL_MODES.has(details))) return [];
  return [`${loc}: details must be "name", "size", "modified" or "permissions"`];
}

// The flat tab presentation fields, shared by every entry type that produces a main-area tab.
export function presentationProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'color', 'string', loc),
    ...checkField(value, 'number', 'number', loc),
    ...checkField(value, 'focus', 'boolean', loc),
    ...checkField(value, 'group', 'number', loc),
    ...checkField(value, 'groupColor', 'string', loc),
    ...checkPane(value, loc),
  ];
}

// Every field the agent opener reads, so a hand-written entry that would break a launch part-way is
// refused here instead: `cwd` goes through path expansion, and `log` and `schedule` are handed on
// as records (an agent's `schedule` is saved entries, unlike a harness's list of specs).
export function agentProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'name', 'string', loc, true),
    ...checkField(value, 'remote', 'string', loc),
    ...checkField(value, 'cwd', 'string', loc),
    ...checkField(value, 'workspaceDir', 'string', loc),
    ...checkField(value, 'title', 'string', loc),
    ...checkField(value, 'active', 'boolean', loc),
    ...checkField(value, 'offline', 'boolean', loc),
    ...checkField(value, 'cmdHistory', 'string[]', loc),
    ...checkField(value, 'context', 'string[]', loc),
    ...checkField(value, 'commandQueue', 'string[]', loc),
    ...checkField(value, 'log', 'object[]', loc),
    ...checkField(value, 'schedule', 'object[]', loc),
  ];
}

export function harnessProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'name', 'string', loc, true),
    ...checkField(value, 'tool', 'string', loc, true),
    ...checkField(value, 'model', 'string', loc),
    ...checkField(value, 'effort', 'string', loc),
    ...checkField(value, 'cwd', 'string', loc),
    ...checkField(value, 'remote', 'string', loc),
    ...checkField(value, 'workspace', 'boolean', loc),
    ...checkField(value, 'autoApprove', 'boolean', loc),
    ...checkField(value, 'offline', 'boolean', loc),
    ...checkField(value, 'browser', 'boolean', loc),
    ...checkField(value, 'run', 'string[]', loc),
    ...checkField(value, 'schedule', 'string[]', loc),
  ];
}

export function filesProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkDock(value, loc),
    ...checkDetails(value, loc),
    ...checkField(value, 'in', 'string', loc),
    ...checkField(value, 'path', 'string', loc),
    ...checkField(value, 'expanded', 'string[]', loc),
    ...checkField(value, 'cursor', 'string', loc),
    ...checkField(value, 'anchor', 'string', loc),
    ...checkField(value, 'selected', 'string[]', loc),
  ];
}

export function editorProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'path', 'string', loc, true),
    ...checkField(value, 'in', 'string', loc),
    ...checkField(value, 'line', 'number', loc),
  ];
}

export function notificationsProblems(value: Record<string, unknown>, loc: string): string[] {
  return [...checkDock(value, loc), ...checkField(value, 'focus', 'boolean', loc)];
}

export function schedulesProblems(value: Record<string, unknown>, loc: string): string[] {
  return checkDock(value, loc);
}

// A legacy image or markdown entry names the file it opens; neither authors a label.
export function pathProblems(value: Record<string, unknown>, loc: string): string[] {
  return checkField(value, 'path', 'string', loc, true);
}

// A plugin entry names the plugin that owns the resulting tab, and the file it opens when there is
// one: a plugin claiming no file extensions is reached by its command instead, so its entry carries
// no path and relaunch reissues that command.
export function pluginProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'id', 'string', loc, true),
    ...checkDock(value, loc),
    ...checkField(value, 'path', 'string', loc),
  ];
}

export function pageProblems(value: Record<string, unknown>, loc: string): string[] {
  return checkField(value, 'url', 'string', loc, true);
}

export function sshProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'destination', 'string', loc, true),
    ...checkField(value, 'options', 'string[]', loc),
  ];
}
