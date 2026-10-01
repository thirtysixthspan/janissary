import { handlePickerKey, type OverlayPluginCapabilities, type OverlayPluginModule } from '../api';
import { ClipboardHistoryPopup } from './Popup';
import {
  disposeHistory, rows, selectNewest, selection, setSelection, startHistory, textAt,
} from './store';

// The module the host loads. It owns three things — the store, the keys, and the paste — and hands
// the host an overlay to publish. It never opens anything itself: the chord, the command word, and
// the context menu all reach it through the same registered overlay, which is why there is one route
// in rather than three that could disagree about what is on screen.

const PLUGIN_ID = 'clipboard-history';

// What `handlePickerKey` needs is the *count* of rows and which one is selected, so the rows go to it
// as their ids and choosing resolves back to the full text — which is what gets pasted.
const rowIds = () => rows().map((row) => row.id);

const module: OverlayPluginModule = {
  start: (capabilities: OverlayPluginCapabilities) => {
    // The cap is applied here, at activation, rather than at import: the plugin's module is loaded
    // only when the popup is first opened, which is after the host's configuration has arrived.
    startHistory(capabilities.maxEntries);
    // Pasting is kept separate from closing because the two routes in close differently. A keypress
    // goes through `handlePickerKey`, which closes on Return and on Escape alike; a row click goes
    // straight through `choose`. Folding the close into `paste` as well would close twice on Return.
    const pasteOnly = (text: string, anchor: HTMLElement | null) => capabilities.paste(text, anchor);
    const chooseByClick = (text: string, anchor: HTMLElement | null) => {
      pasteOnly(text, anchor);
      capabilities.close();
    };
    return {
      name: PLUGIN_ID,
      // The popup claims the command bar's keys while it is open, like every other modal overlay —
      // arrows move the selection, Return chooses, Escape closes. It does not *disable* the bar: the
      // whole point is pasting at the caret, which needs the bar still there.
      claimsCommandBar: true,
      render: (anchor) => <ClipboardHistoryPopup choose={(text) => chooseByClick(text, anchor)} />,
      onKey: (event) => handlePickerKey(
        event, rowIds(), selection(), setSelection,
        (id) => {
          const index = rowIds().indexOf(id);
          const text = index === -1 ? undefined : textAt(index);
          // Return carries no anchor even when the overlay was opened from the context menu, because
          // by then the menu has closed and its element is no longer what the user aimed at; the click
          // that gets here carries one, because the element is still the thing under the pointer.
          if (text !== undefined) pasteOnly(text, null);
        },
        capabilities.close,
      ),
      onOpen: selectNewest,
    };
  },
  dispose: () => {
    disposeHistory();
  },
};

export default module;
