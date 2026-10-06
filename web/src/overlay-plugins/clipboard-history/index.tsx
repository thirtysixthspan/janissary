import { handlePickerKey, type OverlayPluginCapabilities, type OverlayPluginModule } from '../api';
import { ClipboardHistoryView } from './ClipboardHistoryView';
import { createClipboardHistoryStore, type ClipboardHistoryStore } from './store';

const PLUGIN_ID = 'clipboard-history';

export function createClipboardHistoryPlugin(
  store: ClipboardHistoryStore = createClipboardHistoryStore(),
): OverlayPluginModule {
  return {
    start: (capabilities: OverlayPluginCapabilities) => {
      store.start(() => capabilities.maxEntries);
      const pasteOnly = (text: string, anchor: HTMLElement | null) => capabilities.paste(text, anchor);
      const chooseByClick = (text: string, anchor: HTMLElement | null) => {
        pasteOnly(text, anchor);
        capabilities.close();
      };
      return {
        name: PLUGIN_ID,
        claimsCommandBar: true,
        render: (anchor) => (
          <ClipboardHistoryView store={store} choose={(text) => chooseByClick(text, anchor)} />
        ),
        onKey: (event) => {
          if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            capabilities.close();
            return;
          }
          const rowIds = store.getRows().map((row) => row.id);
          handlePickerKey(
            event,
            rowIds,
            store.getSelection(),
            store.setSelection,
            (id) => {
              const index = store.getRows().findIndex((row) => row.id === id);
              const text = index === -1 ? undefined : store.getTextAt(index);
              if (text !== undefined) pasteOnly(text, null);
            },
            capabilities.close,
          );
        },
        onOpen: store.selectNewest,
      };
    },
    dispose: store.dispose,
  };
}

const module = createClipboardHistoryPlugin();

export default module;
