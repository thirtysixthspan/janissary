// One rule for reading the text after a `[NAME]:` marker in a persona reply, shared by the
// monitor's summary/suggestion parser and the in-editor hunk parser. A value runs to the next
// bracket-marker line or the end of the input, so it may span multiple lines.
//
// Only horizontal whitespace is skipped after the colon. Using `\s*` instead would also consume
// the newline that separates an empty in-line value from a following `[NAME]:` line, letting the
// empty field swallow the next marker as its value. Callers trim the captured text, so a value
// that legitimately starts on the next line is still returned without its leading whitespace.
export function captureMarker(reply: string, name: string): string | undefined {
  const re = new RegExp(String.raw`(?:^|\n)\[${name}]:[ \t]*([\s\S]*?)(?=\n\[[A-Z]+]:|$)`);
  return re.exec(reply)?.[1]?.trim();
}
