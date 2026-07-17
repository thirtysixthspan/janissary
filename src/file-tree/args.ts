// Parses the argument tail of a `files [left|right] [path]` / `files in <label> [on <side>]`
// command. Consumes leading `in <label>` / `on <left|right>` clauses (either order, each at most
// once), then falls back to the bare `left`/`right` keyword if neither clause was used. Whatever's
// left over is the path target.
export function parseFileTreeArgs(rest: string): { inLabel?: string; dock: 'left' | 'right' | null; target: string } {
  let cursor = rest;
  let inLabel: string | undefined;
  let dock: 'left' | 'right' | null = null;

  for (;;) {
    if (inLabel === undefined) {
      const inMatch = /^in\s+(\S+)\b\s*/i.exec(cursor);
      if (inMatch) { inLabel = inMatch[1]; cursor = cursor.slice(inMatch[0].length); continue; }
    }
    if (dock === null) {
      const onMatch = /^on\s+(left|right)\b\s*/i.exec(cursor);
      if (onMatch) { dock = onMatch[1].toLowerCase() as 'left' | 'right'; cursor = cursor.slice(onMatch[0].length); continue; }
    }
    break;
  }
  if (inLabel === undefined && dock === null) {
    const keyword = /^(left|right)\b\s*/i.exec(cursor);
    if (keyword) { dock = keyword[1].toLowerCase() as 'left' | 'right'; cursor = cursor.slice(keyword[0].length); }
  }
  return { inLabel, dock, target: cursor.trim() };
}
