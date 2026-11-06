import type { BusyOwner, Tab, TabRuntime } from './types.js';
import { runtimeFor } from './runtime.js';

export function isBusy(tabs: Tab[], label: string): boolean {
  return runtimeFor(tabs, label)?.busy ?? false;
}

export function cwdOf(tabs: Tab[], label: string): string | undefined {
  return runtimeFor(tabs, label)?.cwd;
}

export function setCwd(tabs: Tab[], label: string, dir: string): void {
  const runtime = runtimeFor(tabs, label);
  if (runtime) runtime.cwd = dir;
}

function updateBusyProjection(runtime: TabRuntime): void {
  runtime.busy = runtime.unownedBusy === true || (runtime.busyOwners?.size ?? 0) > 0;
}

export function addBusy(tabs: Tab[], label: string, owner?: BusyOwner): void {
  const runtime = runtimeFor(tabs, label);
  if (!runtime) return;
  if (owner === undefined) runtime.unownedBusy = true;
  else {
    runtime.busyOwners ??= new Set();
    runtime.busyOwners.add(owner);
  }
  updateBusyProjection(runtime);
}

export function deleteBusy(tabs: Tab[], label: string, owner?: BusyOwner): void {
  const runtime = runtimeFor(tabs, label);
  if (!runtime) return;
  if (owner === undefined) runtime.unownedBusy = false;
  else runtime.busyOwners?.delete(owner);
  updateBusyProjection(runtime);
}

export function clearBusy(tabs: Tab[], label: string): void {
  const runtime = runtimeFor(tabs, label);
  if (!runtime) return;
  runtime.unownedBusy = false;
  runtime.busyOwners?.clear();
  updateBusyProjection(runtime);
}

export function contextFor(tabs: Tab[], label: string): string[] {
  return runtimeFor(tabs, label)?.context ?? [];
}

export function setContext(tabs: Tab[], label: string, context: string[]): void {
  const runtime = runtimeFor(tabs, label);
  if (runtime) runtime.context = context;
}

export function appendContext(tabs: Tab[], label: string, text: string): void {
  const runtime = runtimeFor(tabs, label);
  if (runtime) runtime.context = [...runtime.context, text];
}
