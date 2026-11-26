// Pull a `--base <ref>` (or `--base=<ref>`) option out of a script's arguments. The ref scopes the
// changed-file set to a branch's committed changes since that ref, on top of uncommitted work.

export function parseBaseRef(args) {
  const rest = [];
  let base;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument.startsWith('--base=')) {
      base = argument.slice('--base='.length);
      if (base === '') return { base: undefined, rest, error: '--base needs a git ref' };
    } else if (argument === '--base') {
      base = args[index + 1];
      if (base === undefined || base.startsWith('-')) return { base: undefined, rest, error: '--base needs a git ref' };
      index += 1;
    } else {
      rest.push(argument);
    }
  }
  return { base, rest, error: undefined };
}
