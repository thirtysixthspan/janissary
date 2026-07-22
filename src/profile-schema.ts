// Structural schema for a single-file profile (`profiles/<name>.json`), shared by the loader
// (`profile-file.ts`, all-or-nothing) and the `profile validate` command (`profile/validate.ts`,
// collect-every-problem). Both run the exact same checks; only what they do with a failure differs.
// Pure, catalog-free, hand-written predicates — no schema library (see the plan's Decision 11).

type FieldKind = 'string' | 'number' | 'boolean' | 'string[]';

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

// The nested `tab` presentation object, shared by agent and harness entries.
function tabProblems(tab: unknown, loc: string): string[] {
  if (tab === undefined) return [];
  if (!isObject(tab)) return [`${loc}.tab must be an object`];
  return [
    ...checkField(tab, 'color', 'string', `${loc}.tab`),
    ...checkField(tab, 'number', 'number', `${loc}.tab`),
    ...checkField(tab, 'focus', 'boolean', `${loc}.tab`),
    ...checkField(tab, 'group', 'number', `${loc}.tab`),
    ...checkField(tab, 'groupColor', 'string', `${loc}.tab`),
  ];
}

function agentProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  return [...checkField(value, 'name', 'string', loc, true), ...tabProblems(value.tab, loc)];
}

function harnessProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  return [
    ...checkField(value, 'name', 'string', loc, true),
    ...checkField(value, 'type', 'string', loc, true),
    ...checkField(value, 'model', 'string', loc),
    ...checkField(value, 'effort', 'string', loc),
    ...checkField(value, 'cwd', 'string', loc),
    ...checkField(value, 'workspace', 'boolean', loc),
    ...checkField(value, 'autoApprove', 'boolean', loc),
    ...checkField(value, 'offline', 'boolean', loc),
    ...checkField(value, 'run', 'string[]', loc),
    ...checkField(value, 'schedule', 'string[]', loc),
    ...tabProblems(value.tab, loc),
  ];
}

function monitorProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  return [
    ...checkField(value, 'name', 'string', loc),
    ...checkField(value, 'persona', 'string', loc, true),
    ...checkField(value, 'targets', 'string[]', loc, true),
  ];
}

function filesProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  return [...checkDock(value, loc), ...checkField(value, 'in', 'string', loc), ...checkField(value, 'path', 'string', loc)];
}

function editorsProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  return [
    ...checkField(value, 'path', 'string', loc, true),
    ...checkField(value, 'in', 'string', loc),
    ...checkField(value, 'line', 'number', loc),
    ...tabProblems(value.tab, loc),
  ];
}

function notificationsProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  return [...checkDock(value, loc), ...checkField(value, 'focus', 'boolean', loc)];
}

function schedulesProblems(value: unknown, loc: string): string[] {
  if (!isObject(value)) return [`${loc} must be an object`];
  return checkDock(value, loc);
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
    ...sectionProblems(root, 'agents', agentProblems),
    ...sectionProblems(root, 'harnesses', harnessProblems),
    ...sectionProblems(root, 'monitors', monitorProblems),
    ...sectionProblems(root, 'files', filesProblems),
    ...sectionProblems(root, 'editors', editorsProblems),
    ...sectionProblems(root, 'notifications', notificationsProblems),
    ...sectionProblems(root, 'schedules', schedulesProblems),
  ];
  if (root.layout !== undefined) problems.push(...layoutProblems(root.layout));
  return problems;
}
