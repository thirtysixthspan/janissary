// The openers the command bar intercepts: typing `hist`, `theme`, `queue`, `tasks`, `nav …` opens
// the matching overlay instead of reaching the server.
//
// Shared because two features hold this shape and neither may import the other: `pickers` builds the
// openers and `agent-tabs` invokes them. Restating the nine fields in the consumer is exactly the
// drift `usePickerOverlays` exists to prevent — a field added to one list and forgotten in the other
// typechecks fine and fails at the call site instead.
export type PickerCommands = {
  openPicker: () => void;
  openThemePicker: () => void;
  openAppThemePicker: () => void;
  openQueue: () => void;
  openTaskPicker: () => void;
  openProfilePicker: () => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  openTabNavWithQuery: (query: string) => void;
};
