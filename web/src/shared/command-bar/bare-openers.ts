import type { PickerCommands } from './picker-commands';
import { openOverlayForCommand } from '../contributed-overlays';

// The six openers a bare word can name. Named as a subset of the application's own bag rather than
// restated field by field, so a field added there is available here without a second edit.
export type BareOpeners = Pick<
  PickerCommands,
  'openPicker' | 'openThemePicker' | 'openAppThemePicker' | 'openQueue' | 'openTaskPicker' | 'openProfilePicker'
>;

// The bare-word openers, keyed by command word to the opener each one names. A table rather than six
// branches: `nav` is not among them because it carries an argument and toggles when already open,
// which is a branch of its own rather than a bare word, and the chain this replaced sat at its
// cognitive-complexity limit.
const OPENERS: Record<string, keyof BareOpeners> = {
  hist: 'openPicker',
  'syntax theme': 'openThemePicker',
  theme: 'openAppThemePicker',
  queue: 'openQueue',
  tasks: 'openTaskPicker',
  'profile launch': 'openProfilePicker',
};

// Whether this command word is one of the six a bare word opens an overlay for. Read from the table
// rather than from a second list of the same words: a word named in both would be two things able to
// disagree, with nothing to notice when it did.
export function isBareOpener(command: string): boolean {
  return Object.hasOwn(OPENERS, command);
}

// Opens the overlay a command bar's verdict named, and reports whether it opened one. The bare table
// first and the plugin seam second, which is the order the agent bar's own chain has always used: a
// built-in word is the application's before it is anything else's.
export function openCommandBarOverlay(command: string, pickers: BareOpeners): boolean {
  const opener = OPENERS[command];
  if (opener) { pickers[opener](); return true; }
  return openOverlayForCommand(command, null);
}