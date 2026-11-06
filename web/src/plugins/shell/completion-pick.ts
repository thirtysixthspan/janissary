export function completionPickLine(line: string, cursor: number, pick: string): { line: string; cursor: number } {
  const head = line.slice(0, cursor);
  const overlap = longestOverlap(head, pick) || quotedOverlap(head, pick);
  const nextHead = head.slice(0, head.length - overlap) + pick;
  return { line: nextHead + line.slice(cursor), cursor: nextHead.length };
}

function quotedOverlap(head: string, pick: string): number {
  return pick.startsWith('"') || pick.startsWith("'") ? longestOverlap(head, pick.slice(1)) : 0;
}

function longestOverlap(head: string, pick: string): number {
  for (let length = Math.min(head.length, pick.length); length > 0; length -= 1) {
    if (head.endsWith(pick.slice(0, length))) return length;
  }
  return 0;
}
