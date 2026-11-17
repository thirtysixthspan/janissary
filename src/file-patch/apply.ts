import { commitChanges } from './commit.js';
import { applyingFailureLine, malformedPatchLine, patchSuccessText, sectionFailureLine } from './messages.js';
import { parsePatchText } from './parse.js';
import { applySections } from './sections.js';
import { createPatchView } from './view.js';

export function applyPatchText(root: string, text: string): string {
  const parsed = parsePatchText(text);
  if ('error' in parsed) return malformedPatchLine(parsed.error);
  const result = applySections(createPatchView(root), parsed.sections);
  if (!result.ok) return sectionFailureLine(result);
  const outcome = commitChanges(result.changes);
  return outcome.ok ? patchSuccessText(result.rows) : applyingFailureLine(outcome);
}
