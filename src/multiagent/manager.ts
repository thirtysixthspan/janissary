import type { Managers } from '../managers.js';
import { isKnownModel } from '../harness/models.js';
import { messageBus } from '../bus.js';
import { parseFanout } from '../fanout/parse.js';
import { openMultiAgentTab } from '../tab/openers.js';
import { MultiAgentSessions } from './sessions.js';
import { provisionMembers, releaseMembers } from './workspaces.js';
import type { MultiAgentMember } from './types.js';

// What a `fanout` run did, for the transcript and for the captured reply of a run another tab asked
// for as a `request`: the new tab, the members that will run, and the ones refused.
export type FanoutOutcome =
  | { label: string; running: number; skipped: string[] }
  | { error: string };

// A member naming a model the opencode catalog does not carry, or one listed twice, is refused
// rather than run — the rest of the run proceeds, because a comparison of eight where one model has
// been retired is still worth reading. The refusal is the member's own row, which is why this
// returns members rather than a list of strings.
function resolveMembers(requested: string[]): MultiAgentMember[] {
  const members: MultiAgentMember[] = [];
  const accepted = new Set<string>();
  for (const [index, model] of requested.entries()) {
    const member: MultiAgentMember = { index, model, state: 'cloning' };
    if (!isKnownModel('opencode', model)) {
      member.state = 'failed';
      member.error = `"${model}" is not an opencode model in the harness catalog.`;
    } else if (accepted.has(model)) {
      member.state = 'failed';
      member.error = `"${model}" is listed more than once.`;
    } else {
      accepted.add(model);
    }
    members.push(member);
  }
  return members;
}

// Owns a multi-agent tab's whole run: it resolves the member list against the model catalog,
// provisions each member's clone, opens and prompts each member's connection, and holds the answers
// on the tab's payload. Closing the tab is the entire teardown — the clones are disposable, the
// answers *are* the payload, and the connections die with it — so there is no cancel and no
// `closeTab` per member beyond the sweep the tab-close walk already performs.
export class MultiAgentManager {
  // label -> that tab's members, held so `closeTab` can release their clones and `dispose` can sweep
  // what is left at shutdown. The tab's own payload holds the same member objects.
  private runs = new Map<string, MultiAgentMember[]>();
  private sessions = new MultiAgentSessions();

  constructor(private managers: Managers) {}

  // Start a run from `input` (the whole command line) and report what it did. Never throws and never
  // opens a tab for a run whose every member was refused.
  run(label: string, input: string): FanoutOutcome {
    const parsed = parseFanout(input);
    if ('error' in parsed) return parsed;
    const members = resolveMembers(parsed.members);
    const refused = members.filter((m) => m.state === 'failed').map((m) => m.error ?? `"${m.model}" was refused.`);
    if (refused.length === members.length) {
      return { error: `No fanout member can run: ${refused.join(' ')}` };
    }

    // `--offline` on the issuing tab is what a member inherits, exactly as a workspaced tab's own
    // ACP agent inherits it, and it is carried onto the new tab so its metadata row reports it.
    const offline = this.managers.tab.byLabel(label)?.offline ?? false;
    const tabLabel = openMultiAgentTab(this.managers.tab, {
      prompt: parsed.prompt,
      members,
    }, offline);

    this.runs.set(tabLabel, members);
    provisionMembers(tabLabel, members, this.managers, (member) => {
      // A member is asked the instant its clone is ready, and that readiness is the only gate: an
      // ACP session needs no other waiting, since `connectAcp`'s prompt awaits its own handshake.
      this.sessions.connect(tabLabel, member, parsed.prompt, offline);
      messageBus.emit('state', { type: 'dirty' });
    });
    messageBus.emit('state', { type: 'dirty' });
    // Counted after provisioning, not before: a clone that could not start fails its member here,
    // and a summary that reported it as running would be reporting a run that is not happening.
    const running = members.filter((m) => m.state !== 'failed');
    const skipped = members.filter((m) => m.state === 'failed').map((m) => m.error ?? `"${m.model}" was refused.`);
    return { label: tabLabel, running: running.length, skipped };
  }

  closeTab(label: string): void {
    this.sessions.closeTab(label);
    const members = this.runs.get(label);
    if (members) releaseMembers(label, members, this.managers);
    this.runs.delete(label);
  }

  dispose(): void {
    this.sessions.dispose();
    for (const [label, members] of this.runs) releaseMembers(label, members, this.managers);
    this.runs.clear();
  }
}
