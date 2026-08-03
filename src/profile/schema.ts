// Structural schema for a single-file profile (`profiles/<name>.json`), shared by the loader
// (`profile-file.ts`, all-or-nothing) and the `profile validate` command (`profile/validate.ts`,
// collect-every-problem). Both run the exact same checks; only what they do with a failure differs.
// Pure, catalog-free, hand-written predicates — no schema library (see the plan's Decision 11).

type FieldKind = 'string' | 'number' | 'boolean' | 'string[]';

// The four file-navigator detail modes a `files` entry's `details` key may name.
const DETAIL_MODES = new Set(['name', 'size', 'modified', 'permissions']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeKind(kind: FieldKind): string {
  if (kind === 'string[]') return 'an array of strings';
  return kind === 'boolean' ? 'a boolean' : `a ${kind}`;
}

// Validate one optional (or required) field of an object against a primitive kind, returning a
// located message per problem. An absent optional field is fine; an absent required field is a problem.
function checkField(obj: Record<string, unknown>, key: string, kind: FieldKind, loc: string, required = false): string[] {
  const value = obj[key];
  if (value === undefined) return required ? [`${loc}: ${key} is required`] : [];
  const ok = kind === 'string[]'
    ? Array.isArray(value) && value.every((item) => typeof item === 'string')
    : typeof value === kind;
  return ok ? [] : [`${loc}: ${key} must be ${describeKind(kind)}`];
}

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

// The flat tab presentation fields, shared by every entry type that produces a main-area tab.
function presentationProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'color', 'string', loc),
    ...checkField(value, 'number', 'number', loc),
    ...checkField(value, 'focus', 'boolean', loc),
    ...checkField(value, 'group', 'number', loc),
    ...checkField(value, 'groupColor', 'string', loc),
    ...checkPane(value, loc),
  ];
}

function agentProblems(value: Record<string, unknown>, loc: string): string[] {
  return checkField(value, 'name', 'string', loc, true);
}

function harnessProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'name', 'string', loc, true),
    ...checkField(value, 'tool', 'string', loc, true),
    ...checkField(value, 'model', 'string', loc),
    ...checkField(value, 'effort', 'string', loc),
    ...checkField(value, 'cwd', 'string', loc),
    ...checkField(value, 'workspace', 'boolean', loc),
    ...checkField(value, 'autoApprove', 'boolean', loc),
    ...checkField(value, 'offline', 'boolean', loc),
    ...checkField(value, 'run', 'string[]', loc),
    ...checkField(value, 'schedule', 'string[]', loc),
  ];
}

// The eleven kinds of tab a profile may declare. Listed once, so the dispatcher's default arm and
// the message it produces cannot drift apart. `image` is the pre-plugin spelling of a `plugin`
// entry with id `image` and stays accepted so a saved profile keeps launching.
const TAB_TYPES: string[] = [
  'agent', 'harness', 'editor', 'files', 'notifications', 'schedules', 'plugin', 'image', 'markdown', 'page', 'ssh',
];

// The kinds that can occupy a place in the tab strip, and so carry the flat presentation fields. A
// `files` entry is included because an undocked navigator lands in the strip like any other tab; a
// `schedules` entry is always docked, and a `notifications` entry's own `focus` means "visible in
// the sidebar switcher" rather than "active after launch".
const PRESENTATION_TYPES = new Set(['agent', 'harness', 'editor', 'files', 'plugin', 'image', 'markdown', 'page', 'ssh']);

// One element of the `tabs` array: an object carrying a recognized `type`, the presentation fields
// its type allows, and whatever else that type requires.
function tabProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  const type = value.type;
  if (typeof type !== 'string' || !TAB_TYPES.includes(type)) {
    return [`${loc}: type must be one of ${TAB_TYPES.join(', ')}`];
  }
  const shared = PRESENTATION_TYPES.has(type) ? presentationProblems(value, loc) : [];
  // `image` and `markdown` reach the default arm: both are fully checked by `pathProblems`.
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
  default: { return [...shared, ...pathProblems(value, loc)]; }
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

// `details`, when present, must name one of the four file-navigator detail modes.
function checkDetails(obj: Record<string, unknown>, loc: string): string[] {
  const details = obj.details;
  if (details === undefined || (typeof details === 'string' && DETAIL_MODES.has(details))) return [];
  return [`${loc}: details must be "name", "size", "modified" or "permissions"`];
}

function filesProblems(value: Record<string, unknown>, loc: string): string[] {
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

function editorProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'path', 'string', loc, true),
    ...checkField(value, 'in', 'string', loc),
    ...checkField(value, 'line', 'number', loc),
  ];
}

function notificationsProblems(value: Record<string, unknown>, loc: string): string[] {
  return [...checkDock(value, loc), ...checkField(value, 'focus', 'boolean', loc)];
}

function schedulesProblems(value: Record<string, unknown>, loc: string): string[] {
  return checkDock(value, loc);
}

// An image or markdown entry names the file it opens; neither authors a label.
function pathProblems(value: Record<string, unknown>, loc: string): string[] {
  return checkField(value, 'path', 'string', loc, true);
}

// A plugin entry names the file it opens and the plugin that owns the resulting tab.
function pluginProblems(value: Record<string, unknown>, loc: string): string[] {
  return [...checkField(value, 'id', 'string', loc, true), ...pathProblems(value, loc)];
}

function pageProblems(value: Record<string, unknown>, loc: string): string[] {
  return checkField(value, 'url', 'string', loc, true);
}

function sshProblems(value: Record<string, unknown>, loc: string): string[] {
  return [
    ...checkField(value, 'destination', 'string', loc, true),
    ...checkField(value, 'options', 'string[]', loc),
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
