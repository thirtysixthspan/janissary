// The keystroke that accepts opencode's highlighted permission option: a carriage return. opencode's
// permission prompt is a selected-row menu (`⇆ select  enter confirm`) whose default selection is
// `Allow once`, the one-time choice, so Enter confirms it — never the persistent `Allow always`.
export const OPENCODE_APPROVAL_KEYSTROKE = '\r';

// The heavy vertical bar opencode draws down the left edge of its permission panel.
const PANEL_BORDER = '┃';

// A rendered line with surrounding whitespace and opencode's leading panel border removed, so the
// anchors below compare against the panel's own text.
function panelText(line: string): string {
  let text = line.trim();
  while (text.startsWith(PANEL_BORDER)) text = text.slice(PANEL_BORDER.length).trimStart();
  return text;
}

// The prompt's title row, anchored to its leading text so prose that merely mentions a required
// permission never anchors a match — and opencode's later `Always allow` confirmation stage, which
// carries a different title, is never answered. The row is matched by prefix rather than for
// equality because opencode paints its sidebar into the same screen rows: beside a sidebar the
// title's row also carries the sidebar's text, far to the right of the panel.
function isTitleLine(text: string): boolean {
  return text.startsWith('△ Permission required');
}

// The option row, led by the default one-time choice. `Allow always` is not required between them,
// since only `Allow once` (what Enter confirms) and `Reject` anchor the menu.
function isOptionRow(text: string): boolean {
  return text.startsWith('Allow once') && text.includes('Reject');
}

// The confirm hint opencode pins to the option row, or to its own line when the row wraps.
// Matched on `enter conf` — the prefix the whole hint and a truncated one share — followed by
// end-of-line or the `irm` that completes it, so a longer word that merely starts the same way
// (`enter config`) is not read as the hint.
const CONFIRM_HINT = 'enter conf';
const CONFIRM_HINT_TAIL = 'irm';

// The select hint that leads the confirm hint, right-aligned to the panel. Truncation removes the
// hint's tail, so this token outlives the confirm hint and still identifies the footer on a panel
// narrow enough to have clipped the confirm hint away entirely.
const SELECT_HINT = '⇆ select';

// The prompt's hint footer, whole or clipped. opencode right-aligns the hint to its permission
// panel and clips it rather than wrapping it, so a sidebar of its own — taking the right of the
// screen — narrows the panel until the hint arrives truncated (`… ⇆ select  enter conf`). Either
// surviving token counts; requiring the whole `enter confirm` would miss every such prompt.
function isConfirmFooter(text: string): boolean {
  if (text.includes(SELECT_HINT)) return true;
  const at = text.indexOf(CONFIRM_HINT);
  if (at === -1) return false;
  const tail = text.slice(at + CONFIRM_HINT.length);
  return tail === '' || tail === CONFIRM_HINT_TAIL;
}

// Whether the rendered screen `text` shows a live opencode permission prompt. Pure and deterministic:
// recognizes the prompt by its structure — the title, then a later option row, then the confirm
// footer on that row or below it — rather than by the variable request, path, or pattern lines.
// opencode is full-screen and removes the prompt once answered, so no stale-scrollback check is
// needed the way claude's and codex's inline menus require one.
export function detectOpencodePermissionGate(text: string): boolean {
  const lines = text.split('\n').map((line) => panelText(line));
  const titleIndex = lines.findIndex((line) => isTitleLine(line));
  if (titleIndex === -1) return false;
  const optionIndex = lines.findIndex((line, i) => i > titleIndex && isOptionRow(line));
  if (optionIndex === -1) return false;
  return lines.slice(optionIndex).some((line) => isConfirmFooter(line));
}
