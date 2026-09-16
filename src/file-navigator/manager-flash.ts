import type { MutationContext } from './manager-mutations.js';
import type { FilesTabState } from './state.js';
import type { FileNavigatorCommitStatus, FileNavigatorPullStatus } from '../tab/types.js';

// How long a settled pull's or commit's success or failure stays on the header button before it
// returns to rest. Longer than the editor's 1.5-second "Saved" flash because either work item runs
// long enough that the user may well have looked away while it did.
export const FLASH_MS = 3000;

// The flash machine's view of one button's pair of `FilesTabState` fields: explicit read/write
// functions of the state rather than string keys, so the field names in `state.ts` stay checked by
// the compiler and the parameterization stays concrete.
export type FlashDescriptor<Status> = {
  status: (state: FilesTabState) => Status | undefined;
  setStatus: (state: FilesTabState, status: Status | undefined) => void;
  flash: (state: FilesTabState) => ReturnType<typeof setTimeout> | undefined;
  setFlash: (state: FilesTabState, flash: ReturnType<typeof setTimeout> | undefined) => void;
};

export const pullFlashDescriptor: FlashDescriptor<FileNavigatorPullStatus> = {
  status: (state) => state.pull,
  setStatus: (state, status) => { state.pull = status; },
  flash: (state) => state.pullFlash,
  setFlash: (state, flash) => { state.pullFlash = flash; },
};

export const commitFlashDescriptor: FlashDescriptor<FileNavigatorCommitStatus> = {
  status: (state) => state.commit,
  setStatus: (state, status) => { state.commit = status; },
  flash: (state) => state.commitFlash,
  setFlash: (state, flash) => { state.commitFlash = flash; },
};

// The manager internals the machine needs: the mutating operations' own context is enough — it
// already carries the tab map and the manager's private `rebuild`.
export type FlashContext = Pick<MutationContext, 'tabs' | 'rebuild'>;

// Show a status on the button, redraw once, and arm the timer that returns it to rest. A tab that
// closed mid-action has nothing left to show it on. Any timer the button was holding from a
// previous flash of the same action is cleared first.
export function armFlash<Status>(
  context: FlashContext, label: string, descriptor: FlashDescriptor<Status>, status: Status,
): void {
  const state = context.tabs.get(label);
  if (!state) return;
  const previous = descriptor.flash(state);
  if (previous) clearTimeout(previous);
  descriptor.setStatus(state, status);
  context.rebuild(label);
  descriptor.setFlash(state, setTimeout(() => restFlash(context, label, descriptor), FLASH_MS));
}

// Return the button to rest and redraw. A tab that closed after arming has nothing left to clear.
export function restFlash<Status>(
  context: FlashContext, label: string, descriptor: FlashDescriptor<Status>,
): void {
  const state = context.tabs.get(label);
  if (!state) return;
  const flash = descriptor.flash(state);
  if (flash) clearTimeout(flash);
  descriptor.setFlash(state, undefined);
  descriptor.setStatus(state, undefined);
  context.rebuild(label);
}

// Whether the tab is still the one that started the action — a tree closed or re-rooted mid-flight
// keeps whatever it holds now rather than having another root's outcome applied to it.
export function stillRooted(context: FlashContext, label: string, root: string): boolean {
  const current = context.tabs.get(label);
  return current !== undefined && current.root === root;
}

// Every descriptor whose timer a tab close must clear, one place so a future third button can be
// forgotten nowhere: closeTabState walks this list rather than naming fields itself.
export const FLASH_DESCRIPTORS: ReadonlyArray<{
  flash: (state: FilesTabState) => ReturnType<typeof setTimeout> | undefined;
}> = [pullFlashDescriptor, commitFlashDescriptor];

export function clearFlashTimers(state: FilesTabState): void {
  for (const descriptor of FLASH_DESCRIPTORS) {
    const flash = descriptor.flash(state);
    if (flash) clearTimeout(flash);
  }
}
