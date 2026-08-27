// The commenting editor plugin. Lazily imported by the host the first time Cmd+/ is pressed, so
// nothing here is fetched in a session that never comments.

import type { EditorPluginHandler } from '../api';
import { syntaxForFile } from './syntax';
import { toggleComments } from './toggle';

// A file whose extension has no comment syntax — or which has no extension at all — returns null,
// which the editor treats as a silent no-op: nothing is edited and no undo step is recorded.
const run: EditorPluginHandler = (request) => {
  const syntax = syntaxForFile(request.file);
  if (!syntax) return null;
  return toggleComments(request, syntax);
};

export default run;
