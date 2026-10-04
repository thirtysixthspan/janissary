import { parseAgentCommand } from '../agent/commands.js';
import { parseMsgCommand } from '../messaging.js';
import { parseSendCommand, deliverTo } from '../commands/send.js';
import { resolveTarget } from '../commands/resolve-target.js';
import { resolveCommand } from '../resolve.js';
import { isKnownModel } from '../harness/models.js';
import { unknownAgentModel } from '../profile/new-agent.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';

// How many `agent` launches deep a tab may sit before it can no longer delegate. The root tab is 0
// and its workers are 1, so this allows one level of nesting — a coordinator's worker can hand work
// to a worker of its own, which is what a review-then-verify delegation needs — and refuses the tab
// that would be a third link. Every agent tab runs an ACP agent holding this same tool table, so
// without a bound one prompt could grow a tree of workspaces and model spend.
export const MAX_AGENT_DEPTH = 2;

// Every shape this tool owns, as the tool must recognize it in the last line of a reply. `send` and
// `msg` carry free text after a fixed head, so each demands its whole argument count: a line that
// merely contains one of these words belongs to whichever tool really owns it.
const AGENT_COMMAND = /^agent\b/i;
const SEND_COMMAND = /^send\s+\S+\s+\S/i;
const MSG_COMMAND = /^msg\s+\S+\s+(?:i|info|informational|r|req|request|c|cmd|command)\s+\S/i;

export const DELEGATION_PRIMER = [
  'This host can delegate work to other agents, each running its own model. Syntax:',
  '  agent [<name>] [--model <model-id>]   # open a worker tab in a fresh workspace',
  '  send <worker> <text...>                # hand a worker a task without waiting for it',
  '  msg <worker> request <text...>        # run a command in a worker and get its output back',
  'One delegation is three steps: `agent` opens the worker, `send` or `msg … request` gives it the',
  'task, and `msg … request` returns what the worker produced. Prefer `msg <worker> request acp',
  '"<task>"` when you want the answer inside this turn — it blocks until the worker replies. For a',
  'long task use `send <worker> acp "<task>"`, then poll with `msg <worker> request state`, which',
  "returns that tab's transcript; each poll costs one of this turn's eight tool steps.",
  'A worker opened with `agent <name> --model <model-id>` runs on that model, and the model must be',
  `one this host's catalog offers. Delegation stops at depth ${MAX_AGENT_DEPTH}: a worker asked to`,
  'delegate further must be given the work itself rather than a new worker. A worker handed a task',
  'with `send` will not answer on its own — tell it to reply with `msg <you> response <text>`.',
  'You may only delegate to a tab you opened, and only `acp`, `state`, and `db` may be run in it —',
  'nothing else, and no shell. Other tabs belong to the human.',
  "A worker's answer is screened before it reaches you; a `[harness: …]` line at the top of a result",
  'is the host reporting neutralized harness-shaped text, with the worker\'s own words still below it.',
  'To run one of these, end your reply with exactly one of them on its own final line (no code',
  'fence, nothing after it). When the task is done, reply with the final answer and NO trailing',
  'command.',
].join('\n');

// Whether one cleaned reply line is a delegation command this tool can run.
export function isDelegationCommandLine(line: string): boolean {
  return AGENT_COMMAND.test(line) || SEND_COMMAND.test(line) || MSG_COMMAND.test(line);
}

// What a delegated tab may be asked to run. `msg` executes its text through the full command
// dispatcher in the target tab, so this list is the boundary between prompting a worker and reaching
// the application's command surface: a prompt, a transcript poll, a query. `send` narrows further,
// because the only thing worth handing a worker without waiting for it is a prompt.
const MSG_COMMANDS: ReadonlySet<string> = new Set(['acp', 'state', 'db']);
const SEND_COMMANDS: ReadonlySet<string> = new Set(['acp']);

// Refuse anything the target tab would resolve to something other than one of `allowed`. The text is
// classified with the same resolver the command bar uses, so a shell keyword, a `!` shorthand, and an
// unprefixed unknown are all caught here rather than dispatched.
function refusedCommand(text: string, allowed: ReadonlySet<string>): string | undefined {
  const resolution = resolveCommand(text);
  if (resolution.kind === 'app' && allowed.has(resolution.name)) return undefined;
  return `Cannot run "${text}" in another tab: delegation may only run ${[...allowed].toSorted((a, b) => a.localeCompare(b)).join(', ')} there. Do the work yourself, or ask the human.`;
}

// A worker inherits its delegator's group, so this is what keeps delegation inside the tree the
// delegating tab opened. Fails closed: a delegating tab that cannot be found reaches nothing.
function outsideGroup(managers: Managers, label: string, target: Tab): boolean {
  const own = managers.tab.byLabel(label)?.group;
  return own === undefined || target.group !== own;
}

function refusedTarget(name: string): string {
  return `Cannot delegate to "${name}": it is not one of your own agents.`;
}

// Open a worker. Every way this can be refused comes back as the tool's own result, which is how the
// loop hands a refusal to the agent that asked for it: the depth cap, a `--model` with no value, and a
// model the catalog does not offer. The catalog check is repeated from `newAgentOp` on purpose — that
// one refuses before a clone starts for a person typing the command, and this one stops the tool
// claiming success for a launch it knows will be refused.
function runAgent(managers: Managers, label: string, command: string): string {
  if ((managers.tab.byLabel(label)?.agentDepth ?? 0) >= MAX_AGENT_DEPTH) {
    return `Cannot delegate: this tab is already ${MAX_AGENT_DEPTH} agent launches deep, which is the limit. Do the work here, or hand it to a worker with \`send\`.`;
  }
  const parsed = parseAgentCommand(command);
  if (parsed.modelError) return parsed.modelError;
  if (parsed.model && !isKnownModel('opencode', parsed.model)) return unknownAgentModel(parsed.model);
  managers.profile.newAgent(command);
  if (parsed.name === '') return 'Opening a new agent. This tab is told its name when it is ready.';
  return `Opening agent "${parsed.name}". This tab is told when it is ready; \`msg ${parsed.name} request state\` reads its transcript.`;
}

// Hand a worker a task without waiting for it, reporting exactly what `send` itself would report.
// A harness target takes literal keystrokes in its PTY, which is what `send` is for; an agent target
// dispatches the text as a command there, so it is held to the narrower list.
function runSend(managers: Managers, label: string, command: string): string {
  const parsed = parseSendCommand(command);
  if ('error' in parsed) return parsed.error;
  // `resolveTarget` is kept for its alias resolution and its undefined return, but its report
  // callback is discarded: the refusal is returned here instead, so the agent reads it once and the
  // delegating tab's transcript keeps recording the commands it ran rather than this outcome.
  const target = resolveTarget(parsed.label, managers, () => {});
  if (!target) return `No tab named "${parsed.label}".`;
  if (outsideGroup(managers, label, target)) return refusedTarget(parsed.label);
  if (target.view !== 'harness') {
    const refusal = refusedCommand(parsed.text, SEND_COMMANDS);
    if (refusal) return refusal;
  }
  const error = deliverTo(target, parsed.text, managers);
  if (error) return error;
  return `Sent to ${parsed.label}: ${parsed.text}`;
}

// Run a command in a worker and bring back what it produced. `capture.run` is the same path a typed
// `msg … request` takes, and the answer is screened on the way out — it is worker-authored text about
// to become this agent's next instruction, whatever kind the agent wrote.
function runMsg(managers: Managers, label: string, command: string): Promise<string> {
  const parsed = parseMsgCommand(command);
  if ('error' in parsed) return Promise.resolve(parsed.error);
  const target = managers.tab.byLabel(parsed.to);
  if (!target) return Promise.resolve(refusedTarget(parsed.to));
  if (outsideGroup(managers, label, target)) return Promise.resolve(refusedTarget(parsed.to));
  const refusal = refusedCommand(parsed.text, MSG_COMMANDS);
  if (refusal) return Promise.resolve(refusal);
  return new Promise((resolve) => {
    managers.capture.run(parsed.to, parsed.text, (output) => resolve(scanWorkerAnswer(output)));
  });
}

// Run whichever of the three verbs the agent emitted.
export function runDelegation(managers: Managers, label: string, command: string): string | Promise<string> {
  if (AGENT_COMMAND.test(command)) return runAgent(managers, label, command);
  if (SEND_COMMAND.test(command)) return runSend(managers, label, command);
  return runMsg(managers, label, command);
}

// The tags a harness emits into an agent's own text. A worker answering with one of these is not
// reporting a result — it is writing into the space the host uses to give its own agent
// instructions, so the opening bracket is broken and the tag stops being one.
const CONTROL_TAG = /<(\/?)(system-reminder|system|task-notification|command-name|local-command-stdout)(>|\s[^>]*>)/gi;

// A line that opens a conversation turn. Backslashed so it reads as the worker's text rather than as
// a boundary the host put there.
const TURN_MARKER = /^(Human|Assistant):/gm;

// What a worker's answer becomes before it is handed back as an instruction. A worker reads files
// and pages its parent never sees, so its words are the one channel by which anything it was misled
// by can reach the parent. Only harness-shaped text is neutralized and nothing is deleted, so the
// answer still reads as the worker wrote it. A permission-configuration mention is deliberately left
// alone: naming a setting is not impersonating the harness, and rewriting one would only mangle a
// legitimate answer.
export function scanWorkerAnswer(text: string): string {
  const matched: string[] = [];
  const tagged = text.replaceAll(CONTROL_TAG, (_match, slash: string, name: string, tail: string) => {
    matched.push(`control tag <${name}>`);
    return `<\\${slash}${name}${tail}`;
  });
  const marked = tagged.replaceAll(TURN_MARKER, (match) => {
    matched.push(`turn marker ${match.slice(0, -1)}`);
    return String.raw`${match.slice(0, -1)}\:`;
  });
  if (matched.length === 0) return text;
  const report = `[harness: neutralized ${[...new Set(matched)].join(', ')} in this worker's answer]`;
  return `${report}\n${marked}`;
}