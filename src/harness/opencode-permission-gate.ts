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

// The prompt's title row. Exact, so prose that merely mentions a required permission never anchors
// a match — and opencode's later `Always allow` confirmation stage, which carries a different title,
// is never answered.
function isTitleLine(text: string): boolean {
  return text === '△ Permission required';
}

// The option row, led by the default one-time choice. `Allow always` is not required between them,
// since only `Allow once` (what Enter confirms) and `Reject` anchor the menu.
function isOptionRow(text: string): boolean {
  return text.startsWith('Allow once') && text.includes('Reject');
}

// The confirm hint opencode pins to the option row, or to its own line when the row wraps.
function isConfirmFooter(text: string): boolean {
  return text.includes('enter confirm');
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
