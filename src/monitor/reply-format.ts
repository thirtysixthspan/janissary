// Monitoring-AI reply parsing, split out of parsing.ts: a distinct concern from the
// monitor/unmonitor command parsing that remains there.

// Extract a deliverable report from the monitoring AI's reply. The reply may contain
// anything; only the marker lines count:
//   [SUMMARY]: <text>                — a recap of activity (harness/page), no command
//   [SUGGESTION]: <text>             — an actionable suggestion
//   [COMMAND]: <optional command>    — a command that accompanies a suggestion
// An actionable suggestion wins when both markers are present; a summary carries no
// command. No marker → nothing to deliver (the persona is told silence is fine).
// Extract the text following a `[MARKER]:` line, up to (but not including) the next
// bracket-marker line or the end of the reply — so a marker's own text may span multiple lines
// (e.g. a summary that continues onto bullet points).
function captureMarker(reply: string, marker: string): string | undefined {
  const re = new RegExp(String.raw`(?:^|\n)\[${marker}]:\s*([\s\S]*?)(?=\n\[[A-Z]+]:|$)`);
  return re.exec(reply)?.[1]?.trim();
}

export function parseSuggestion(reply: string): { text: string; command?: string } | null {
  const suggestion = captureMarker(reply, 'SUGGESTION');
  if (suggestion) {
    const command = captureMarker(reply, 'COMMAND');
    return command ? { text: suggestion, command } : { text: suggestion };
  }
  const summary = captureMarker(reply, 'SUMMARY');
  return summary ? { text: summary } : null;
}

// The output-format instructions appended to every persona's startup prompt.
export const SUGGESTION_FORMAT = [
  'Reply using exactly one of these formats:',
  'To recap what a harness or web page is doing (a summary, not a suggestion):',
  '[SUMMARY]: <one or two short sentences>',
  'To offer an actionable suggestion:',
  '[SUGGESTION]: <one short sentence>',
  '[COMMAND]: <a single command the user could run, only if one clearly applies>',
  'Only when you have genuinely nothing to report, reply with the single word: OK',
].join('\n');
