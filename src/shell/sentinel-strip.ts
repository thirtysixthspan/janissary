// Sentinel lines the persistent-shell protocol writes around every command and pwd query
// (`shellCommandInput` and `queryShellPwd` in `./index.js`). Live output never shows them because
// `executeShellCmd`/`queryShellPwd` slice their buffers at the sentinel; restored output — the
// detached peer's replay of bytes that were already echoed — arrives here instead, so it is
// removed line-wise.
const SENTINEL_LINE = /^\s*__(JS_END|PWD)_\d+_\d+__\s*$/;

// What a `pwd` query leaves in the stream: the `pwd` command's own echo and the working directory
// it printed, both on the line(s) just before the `__PWD_…__` sentinel line.
const PWD_COMMAND_LINE = /^\s*pwd\s*$/;
const PATH_LINE = /^\s*\/?\S+\s*$/;

export function stripShellSentinels(data: string): string {
  const lines = data.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const match = SENTINEL_LINE.exec(line);
    if (match) {
      if (match[1] === 'PWD') dropPwdDebris(kept);
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

// A sentinel line removes the query debris directly above it: the cwd answer a `pwd` printed and,
// one line earlier, the `pwd` command itself. Anything else is left alone — output text is not
// second-guessed.
function dropPwdDebris(kept: string[]): void {
  if (kept.length > 0 && PATH_LINE.test(kept.at(-1)!)) kept.pop();
  if (kept.length > 0 && PWD_COMMAND_LINE.test(kept.at(-1)!)) kept.pop();
}
