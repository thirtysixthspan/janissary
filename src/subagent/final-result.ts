const FINAL_RESULT_PATTERN = /<final_result>([\s\S]*?)<\/final_result>/gi;

export function extractFinalResult(text: string): string {
  const matches = [...text.matchAll(FINAL_RESULT_PATTERN)];
  const last = matches.at(-1);
  return last === undefined ? text : (last[1] ?? text).trim();
}
