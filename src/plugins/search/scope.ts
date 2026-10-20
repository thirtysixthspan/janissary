import type { TabPluginOriginTab } from '../api.js';

// Which workspace one search runs over: the launch directory, a local workspace clone, or a
// remote workspace reached through a tab riding its channel. `display` is the origin's own display
// form, carried because the plugin cannot abbreviate a directory itself.
export type SearchScope =
  | { kind: 'launch' }
  | { kind: 'local'; dir: string; label: string; display: string }
  | { kind: 'remote'; dir: string; label: string; display: string; host: string; ride: string };

export type RefusalReason = 'not-ready' | 'gone';

export type ScopeDecision =
  | { kind: 'scope'; scope: SearchScope }
  | { kind: 'refuse'; reason: RefusalReason; label: string }
  | { kind: 'keep' };

type Origin = NonNullable<TabPluginOriginTab>;

function provisioningLabel(origin: Origin): string {
  return origin.workspace?.label ?? origin.workspaceLabel ?? origin.label;
}

// The scope a search started from `origin` runs in. The order of the tests matters: a gone riding
// record still carries `ride`, so `gone` is decided before `remote` is.
export function scopeFrom(origin: TabPluginOriginTab): ScopeDecision {
  if (origin === null) return { kind: 'scope', scope: { kind: 'launch' } };
  if (origin.plugin === 'search') return { kind: 'keep' };
  const workspace = origin.workspace;
  if (workspace?.gone) return { kind: 'refuse', reason: 'gone', label: workspace.label };
  if (origin.provisioning) return { kind: 'refuse', reason: 'not-ready', label: provisioningLabel(origin) };
  if (workspace === undefined) return { kind: 'scope', scope: { kind: 'launch' } };
  const { dir, label, display } = workspace;
  if (workspace.ride !== undefined) {
    return {
      kind: 'scope',
      scope: { kind: 'remote', dir, label, display, host: workspace.host ?? '', ride: workspace.ride },
    };
  }
  return { kind: 'scope', scope: { kind: 'local', dir, label, display } };
}

// Whether two scopes search the same files. Labels, display forms, and which tab is ridden are
// not compared: two riding tabs onto one remote workspace are the same scope.
export function sameScope(a: SearchScope, b: SearchScope): boolean {
  if (a.kind === 'launch' || b.kind === 'launch') return a.kind === b.kind;
  if (a.kind === 'local' && b.kind === 'local') return a.dir === b.dir;
  if (a.kind === 'remote' && b.kind === 'remote') return a.host === b.host && a.dir === b.dir;
  return false;
}

export function refusalLine(reason: RefusalReason, label: string): string {
  const state = reason === 'gone' ? 'is no longer available' : 'is not ready yet';
  return `Search: the workspace of "${label}" ${state}.`;
}

export function scopeDisplay(scope: SearchScope): string {
  return scope.kind === 'launch' ? '$root' : scope.display;
}
