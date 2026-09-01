import { extractBrowserCommand, BROWSER_PRIMER } from '../browser/command.js';
import { extractQuestionCommand, QUESTION_PRIMER, runQuestionCommand } from '../question-command.js';
import type { Managers } from '../managers.js';

// One tool on the ACP run path. The three loop options the agent sees — what it is told the tools
// are, what runs a command it emitted, and what pulls a command out of its reply — are all derived
// from this one shape, so a new tool is one entry rather than three lists that can disagree.
//
// An entry carries two predicates because they read different text: `match` tests the command
// string the agent emitted, `extract` reads the agent's whole reply looking for a command in it.
export type AcpTool = {
  // The tool's slice of the agent primer.
  primer: string;
  // Whether this tool owns an emitted command.
  match: (command: string) => boolean;
  // Run an emitted command in a tab and return its textual output.
  run: (label: string, command: string) => string | Promise<string>;
  // Pull this tool's command out of an agent reply, or nothing when the reply holds none.
  extract: (text: string) => string | null | undefined;
};

// Resolution strategy: **first match over an ordered array**, the same rule `src/commands/index.ts`
// uses. Both the runner and the extractor stop at the first entry that claims the input, so order is
// the tie-break and the database entry stays last — its `match` accepts anything, making it the
// fall-through for a command no other tool recognized.
export function createAcpToolTable(managers: Managers): AcpTool[] {
  return [
    {
      primer: BROWSER_PRIMER,
      match: (command) => /^browser\b/i.test(command),
      run: (label, command) => managers.browser.run(label, command),
      extract: (text) => extractBrowserCommand(text),
    },
    {
      primer: QUESTION_PRIMER,
      match: (command) => /^question\b/i.test(command),
      run: (label, command) => runQuestionCommand(command, label, managers.questions),
      extract: (text) => extractQuestionCommand(text),
    },
    {
      primer: managers.database.primer,
      match: () => true,
      run: (label, command) => managers.database.runInTab(label, command),
      extract: (text) => managers.database.extract(text),
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

// The first command any tool finds in the agent's reply, or null when none does.
export function toolExtractor(tools: AcpTool[]): (text: string) => string | null {
  return (text) => {
    for (const tool of tools) {
      const command = tool.extract(text);
      if (command !== null && command !== undefined) return command;
    }
    return null;
  };
}
