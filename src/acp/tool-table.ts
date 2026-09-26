import { isBrowserCommandLine, BROWSER_PRIMER } from '../browser/command.js';
import { isQuestionCommandLine, QUESTION_PRIMER, runQuestionCommand } from '../question-command.js';
import { findLastCommandLine } from './command-line.js';
import type { Managers } from '../managers.js';

// One tool on the ACP run path. The three loop options the agent sees — what it is told the tools
// are, what runs a command it emitted, and what pulls a command out of its reply — are all derived
// from this one shape, so a new tool is one entry rather than three lists that can disagree.
//
// An entry carries two predicates because they read different text: `match` tests the command
// string the agent emitted, `isCommandLine` tests one cleaned line of the agent's reply.
export type AcpTool = {
  // The tool's slice of the agent primer.
  primer: string;
  // Whether this tool owns an emitted command.
  match: (command: string) => boolean;
  // Run an emitted command in a tab and return its textual output.
  run: (label: string, command: string) => string | Promise<string>;
  // Whether one cleaned reply line is a command in this tool's grammar.
  isCommandLine: (line: string) => boolean;
};

// Resolution strategy for running: **first match over an ordered array**, the same rule
// `src/commands/index.ts` uses. The runner stops at the first entry whose `match` claims the command,
// so order is the tie-break and the database entry stays last — its `match` accepts anything, making
// it the fall-through for a command no other tool recognized. Extraction does not use table order:
// the reply's last line that any tool recognizes is the command, whichever tool owns it.
export function createAcpToolTable(managers: Managers): AcpTool[] {
  return [
    {
      primer: BROWSER_PRIMER,
      match: (command) => /^browser\b/i.test(command),
      run: (label, command) => managers.browser.run(label, command),
      isCommandLine: (line) => isBrowserCommandLine(line),
    },
    {
      primer: QUESTION_PRIMER,
      match: (command) => /^question\b/i.test(command),
      run: (label, command) => runQuestionCommand(command, label, managers.questions),
      isCommandLine: (line) => isQuestionCommandLine(line),
    },
    {
      primer: managers.database.primer,
      match: () => true,
      run: (label, command) => managers.database.runInTab(label, command),
      isCommandLine: (line) => managers.database.isCommandLine(line),
    },
  ];
}

// The joined primer, in table order.
export function toolPrimer(tools: AcpTool[]): string {
  return tools.map((tool) => tool.primer).join('\n\n');
}

// Run an emitted command through the first tool that claims it. The last entry matches everything,
// so this always resolves.
export function toolRunner(tools: AcpTool[], label: string): (command: string) => string | Promise<string> {
  return (command) => {
    const tool = tools.find((candidate) => candidate.match(command));
    if (!tool) throw new Error(`No ACP tool matched command: ${command}`);
    return tool.run(label, command);
  };
}

// The command on the reply's last line that any tool recognizes, or null when no line is one.
export function toolExtractor(tools: AcpTool[]): (text: string) => string | null {
  return (text) => findLastCommandLine(text, (line) => tools.some((tool) => tool.isCommandLine(line)));
}
