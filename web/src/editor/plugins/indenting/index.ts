// The indenting editor plugin. Lazily imported by the host the first time one of its four chords is
// pressed, so nothing here is fetched in a session that never indents.

import type { EditorPluginHandler } from '../api';
import { shiftLines, type ShiftDirection } from './shift';

function directionFor(command: string): ShiftDirection | null {
  if (command === 'indent') return 'indent';
  if (command === 'outdent') return 'outdent';
  return null;
}

// A command the plugin does not implement returns null, which the editor treats as a silent no-op:
// nothing is edited and no undo step is recorded.
const run: EditorPluginHandler = (request) => {
  const direction = directionFor(request.command);
  if (!direction) return null;
  return shiftLines(request, direction);
};

export default run;
