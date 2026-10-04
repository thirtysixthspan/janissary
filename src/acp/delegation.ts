import { parseAgentCommand } from '../agent/commands.js';
import { parseMsgCommand } from '../messaging.js';
import { parseSendCommand, deliverTo } from '../commands/send.js';
import { resolveTarget } from '../commands/resolve-target.js';
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

const appendTo = (managers: Managers, label: string) => (text: string): void => {
  managers.tab.append(label, { input: '', output: text });
};

// Open a worker. Refused at the depth cap and on a model the catalog does not offer, both as this
// tool's return value — which is how the loop hands a refusal back to the agent that asked for it.
function runAgent(managers: Managers, label: string, command: string): string {
  if ((managers.tab.byLabel(label)?.agentDepth ?? 0) >= MAX_AGENT_DEPTH) {
    return `Cannot delegate: this tab is already ${MAX_AGENT_DEPTH} agent launches deep, which is the limit. Do the work here, or hand it to a worker with \`send\`.`;
  }
  const parsed = parseAgentCommand(command);
  if (parsed.modelError) return parsed.modelError;
  managers.profile.newAgent(command);
  const named = parsed.name === '' ? 'a new agent' : parsed.name;
  return `Opening agent "${named}". This tab is told when it is ready; \`msg ${named} request state\` reads its transcript.`;
}

// Hand a worker a task without waiting for it, reporting exactly what `send` itself would report.
function runSend(managers: Managers, label: string, command: string): string {
  const parsed = parseSendCommand(command);
  if ('error' in parsed) return parsed.error;
  const target = resolveTarget(parsed.label, managers, appendTo(managers, label));
  if (!target) return `Sent nothing to "${parsed.label}".`;
  const error = deliverTo(target, parsed.text, managers);
  if (error) return error;
  return `Sent to ${parsed.label}: ${parsed.text}`;
}

// Run a command in a worker and bring back what it produced. `capture.run` is the same path a typed
// `msg … request` takes, and the answer is screened on the way out — it is worker-authored text about
// to become this agent's next instruction, whatever kind the agent wrote.
function runMsg(managers: Managers, command: string): Promise<string> {
  const parsed = parseMsgCommand(command);
  if ('error' in parsed) return Promise.resolve(parsed.error);
  return new Promise((resolve) => {
    managers.capture.run(parsed.to, parsed.text, (output) => resolve(scanWorkerAnswer(output)));
  });
}

// Run whichever of the three verbs the agent emitted.
export function runDelegation(managers: Managers, label: string, command: string): string | Promise<string> {
  if (AGENT_COMMAND.test(command)) return runAgent(managers, label, command);
  if (SEND_COMMAND.test(command)) return runSend(managers, label, command);
  return runMsg(managers, command);
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