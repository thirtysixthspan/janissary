import type { TabView, TabViewBase } from '../protocol.js';
import type { Tab } from './types.js';

type ViewPayloads = Pick<TabViewBase, 'plugin' | 'harness' | 'editor' | 'monitor' | 'files'>;

// Choose the union member whose discriminant matches the payload. A malformed tab carrying a view
// but no payload degrades to the plain base, which the client's guards reject just as they do today.
export function narrowView(base: TabViewBase, view: Tab['view'], payloads: ViewPayloads): TabView {
  switch (view) {
    case 'plugin': {
      return payloads.plugin ? { ...base, view, plugin: payloads.plugin } : base;
    }
    case 'harness': {
      return payloads.harness ? { ...base, view, harness: payloads.harness } : base;
    }
    case 'editor': {
      return payloads.editor ? { ...base, view, editor: payloads.editor } : base;
    }
    case 'monitor': {
      return payloads.monitor ? { ...base, view, monitor: payloads.monitor } : base;
    }
    case 'files': {
      return payloads.files ? { ...base, view, files: payloads.files } : base;
    }
    case 'notifications': {
      return { ...base, view };
    }
    default: {
      return base;
    }
  }
}
