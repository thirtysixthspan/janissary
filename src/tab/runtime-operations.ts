import type { Tab } from './types.js';
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

export function addBusy(tabs: Tab[], label: string): void {
  const runtime = runtimeFor(tabs, label);
  if (runtime) runtime.busy = true;
}

export function deleteBusy(
  tabs: Tab[], label: string, queued: number, onIdle: ((label: string) => void) | null,
): void {
  const runtime = runtimeFor(tabs, label);
  if (runtime) runtime.busy = false;
  if (queued > 0) queueMicrotask(() => onIdle?.(label));
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
