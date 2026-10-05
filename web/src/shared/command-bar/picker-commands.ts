// The openers the command bar intercepts: typing `hist`, `theme`, `queue`, `tasks`, `nav …` opens
// the matching overlay instead of reaching the server.
//
// Shared because two features hold this shape and neither may import the other: `pickers` builds the
// openers and `agent-tabs` invokes them. Restating the nine fields in the consumer is exactly the
// drift `usePickerOverlays` exists to prevent — a field added to one list and forgotten in the other
// typechecks fine and fails at the call site instead.
//
// An opener is told the tab whose plugin bar asked for it, and nothing when the agent bar or a key did.
// Only the queue popup needs it at open time, to decide whether it opens and what it selects first;
// the others ignore it.
export type PickerOpener = (sourceTab?: string) => void;

export type PickerCommands = {
  openPicker: PickerOpener;
  openThemePicker: PickerOpener;
  openAppThemePicker: PickerOpener;
  openQueue: PickerOpener;
  openTaskPicker: PickerOpener;
  openProfilePicker: PickerOpener;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  openTabNavWithQuery: (query: string) => void;
};
