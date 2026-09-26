// Pure helpers for finding the command an ACP agent put at the end of its reply. Every tool's
// extractor and the loop's display filter read reply lines through `cleanCommandLine`, so a code
// fence, a `$ `/`> ` prompt marker, or inline backticks are tolerated the same way everywhere.

// A reply line with any leading whitespace, backticks, `$`, or `>` and any trailing backticks removed.
export function cleanCommandLine(line: string): string {
  return line.replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim();
}

// The last cleaned line of `text` that passes `test`, scanning bottom-up because the primers ask the
// agent to put its command on the final line; null when no line passes.
export function findLastCommandLine(text: string, test: (line: string) => boolean): string | null {
  const lines = text.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = cleanCommandLine(lines[index]);
    if (test(line)) return line;
  }
  return null;
}
