// Structural schema for a single-file profile (`profiles/<name>.json`), shared by the loader
// (`profile-file.ts`, all-or-nothing) and the `profile validate` command (`profile/validate.ts`,
// collect-every-problem). Both run the exact same checks; only what they do with a failure differs.
// Pure, catalog-free, hand-written predicates — no schema library (see the plan's Decision 11).

import type { ProfileTabFile } from './types.js';
import { checkField, isObject } from './schema-fields.js';
import {
  agentProblems, editorProblems, filesProblems, harnessProblems, notificationsProblems,
  pageProblems, pathProblems, pluginProblems, presentationProblems, schedulesProblems, sshProblems,
} from './schema-tab-entry.js';

// Every kind of tab a profile may declare, and whether it can occupy a place in the tab strip and
// so carries the flat presentation fields. `files` carries them because an undocked navigator lands
// in the strip like any other tab; `schedules` is always docked, and a `notifications` entry's own
// `focus` means "visible in the sidebar switcher" rather than "active after launch". `image` and
// `markdown` are the pre-plugin spellings of a `plugin` entry with that id and stay accepted so a
// saved profile keeps launching.
//
// Keyed by `ProfileTabFile['type']`, so a twelfth kind added to that union fails to compile here
// until it is classified — where the two hand-kept lists this replaced would have gone on rejecting
// it on load with `type must be one of …` while the build stayed green.
const TAB_KINDS: Record<ProfileTabFile['type'], boolean> = {
  agent: true,
  harness: true,
  editor: true,
  files: true,
  notifications: false,
  schedules: false,
  plugin: true,
  image: true,
  markdown: true,
  page: true,
  ssh: true,
};

// Declaration order above is the order this message lists, which is the order the two lists it
// replaced used — so the wording `profile validate` prints does not move.
const TAB_TYPES = Object.keys(TAB_KINDS);

function isTabKind(value: unknown): value is ProfileTabFile['type'] {
  return typeof value === 'string' && Object.hasOwn(TAB_KINDS, value);
}

// One element of the `tabs` array: an object carrying a recognized `type`, the presentation fields
// its type allows, and whatever else that type requires.
function tabProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  const type = value.type;
  if (!isTabKind(type)) return [`${loc}: type must be one of ${TAB_TYPES.join(', ')}`];
  const shared = TAB_KINDS[type] ? presentationProblems(value, loc) : [];
  // No `default` arm: `type` is narrowed to the union, so a kind without a case leaves this
  // function without a return and fails to compile.
  switch (type) {
  case 'agent': { return [...shared, ...agentProblems(value, loc)]; }
  case 'harness': { return [...shared, ...harnessProblems(value, loc)]; }
  case 'editor': { return [...shared, ...editorProblems(value, loc)]; }
  case 'files': { return [...shared, ...filesProblems(value, loc)]; }
  case 'notifications': { return notificationsProblems(value, loc); }
  case 'schedules': { return schedulesProblems(value, loc); }
  case 'plugin': { return [...shared, ...pluginProblems(value, loc)]; }
  case 'page': { return [...shared, ...pageProblems(value, loc)]; }
  case 'ssh': { return [...shared, ...sshProblems(value, loc)]; }
  // Both are fully checked by `pathProblems`; they share an arm rather than a default one.
  case 'image':
  case 'markdown': { return [...shared, ...pathProblems(value, loc)]; }
  }
}

function monitorProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  return [
    ...checkField(value, 'name', 'string', loc),
    ...checkField(value, 'persona', 'string', loc, true),
    ...checkField(value, 'targets', 'string[]', loc, true),
  ];
}

function windowProblems(value: unknown): string[] {
  if (!isObject(value)) return ['layout.window must be an object'];
  return [...checkField(value, 'width', 'number', 'layout.window', true), ...checkField(value, 'height', 'number', 'layout.window', true)];
}

function layoutProblems(value: unknown): string[] {
  if (!isObject(value)) return ['layout must be an object'];
  const problems: string[] = [];
  if (value.sidebar !== undefined) {
    if (isObject(value.sidebar)) {
      problems.push(...checkField(value.sidebar, 'left', 'number', 'layout.sidebar'), ...checkField(value.sidebar, 'right', 'number', 'layout.sidebar'));
    } else {
      problems.push('layout.sidebar must be an object');
    }
  }
  if (value.window !== undefined) problems.push(...windowProblems(value.window));
  return [...problems, ...checkField(value, 'tabAreaPct', 'number', 'layout')];
}

// Validate one top-level array section: absent is fine, a non-array is a problem, and each element
// runs through its per-element checker with an indexed location.
function sectionProblems(
  root: Record<string, unknown>, key: string, itemFn: (value: unknown, loc: string) => string[],
): string[] {
  const value = root[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [`${key} must be an array`];
  return value.flatMap((element, index) => itemFn(element, `${key}[${index}]`));
}

// Collect every structural problem in a parsed profile root (already `JSON.parse`d), each with a
// location. An empty result means the file is structurally valid.
export function collectProfileProblems(root: unknown): string[] {
  if (!isObject(root)) return ['profile must be a JSON object'];
  const problems = [
    ...sectionProblems(root, 'tabs', tabProblems),
    ...sectionProblems(root, 'monitors', monitorProblems),
  ];
  if (root.layout !== undefined) problems.push(...layoutProblems(root.layout));
  return problems;
}
