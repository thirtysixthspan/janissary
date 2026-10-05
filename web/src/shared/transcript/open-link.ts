import { isFileLineLink } from './file-link';
import type { TranscriptIntents } from './transcript-intents';

const WEB_LINK = /^https?:\/\//i;

// Where a clicked markdown link goes: a web address through `open`, a `path:line` reference into an
// editor tab. The web check runs first because a URL can end in `:12` too. Answers whether the link
// was one the application opens, so a caller can leave anything else to the browser.
export function openTranscriptLink(
  href: string,
  intents: Pick<TranscriptIntents, 'onOpenFile' | 'onEditFile'>,
): boolean {
  if (WEB_LINK.test(href)) { intents.onOpenFile(href); return true; }
  if (isFileLineLink(href)) { intents.onEditFile(href); return true; }
  return false;
}
