import { HARNESS_NAMES } from '../harness/index.js';

// The `fanout` command's grammar, as a pure function of the command line: the ordered member list
// and the one prompt they all receive, or a usage error. No I/O and no state — the member list is
// resolved against the model catalog by `MultiAgentManager`, which is the only place that can
// report a catalog with nothing in it.

export const FANOUT_USAGE = 'Usage: fanout opencode:<model>... <prompt>';

// One member is a real `git clone` of the repository's `origin` plus a live agent process on top of
// it, so the count is a disk and time cost as much as it is a comparison width. A count outside this
// range is refused here, before any clone is started.
export const MAX_FANOUT_MEMBERS = 8;

// The only harness a member can be. `acpLaunchFor` can also drive claude and codex is in the model
// catalog, but a member is an opencode model; the `opencode:` prefix is kept so the member list
// still reads as a list when a model name is wrong.
const MEMBER_HARNESS = 'opencode';

export type FanoutRequest = { members: string[]; prompt: string };

// The leading `word:` of a candidate member token. A bare `word` with no colon is not member-shaped
// at all and simply ends the member list.
function harnessOf(token: string): string | undefined {
  const colon = token.indexOf(':');
  if (colon < 1) return undefined;
  return token.slice(0, colon).toLowerCase();
}

// Parse `fanout opencode:<model>... <prompt>`. The member list is every leading token naming a
// harness, and the prompt is the whole rest of the line.
//
// A leading token naming a harness other than `opencode` is a usage error rather than the start of
// the prompt, because the user plainly meant it as a member — the refusal names the harness rather
// than repeating the usage line alone. A leading token whose prefix names no harness at all (`fix:`
// opening a prompt) is not member-shaped and begins the prompt instead, so an ordinary prompt that
// happens to start with a colon is still deliverable.
export function parseFanout(input: string): FanoutRequest | { error: string } {
  const members: string[] = [];
  let rest = input.replace(/^\s*fanout\b\s*/i, '').trim();
  for (;;) {
    const token = /^\S+/.exec(rest)?.[0];
    if (!token) break;
    const harness = harnessOf(token);
    if (!harness) break;
    if (!HARNESS_NAMES.includes(harness)) break;
    if (harness !== MEMBER_HARNESS) {
      return { error: `A fanout member must be an ${MEMBER_HARNESS} model, not ${harness}. ${FANOUT_USAGE}` };
    }
    const model = token.slice(token.indexOf(':') + 1);
    if (!model) return { error: FANOUT_USAGE };
    members.push(model);
    if (members.length > MAX_FANOUT_MEMBERS) return { error: FANOUT_USAGE };
    rest = rest.slice(token.length).trimStart();
  }
  const prompt = rest.trim();
  if (members.length === 0 || !prompt) return { error: FANOUT_USAGE };
  return { members, prompt };
}
