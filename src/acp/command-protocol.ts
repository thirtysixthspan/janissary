export function commandProtocolPrimer(maxSteps: number): string {
  return [
    'How commands work:',
    '- To run a command, end your reply with exactly one command on its own final line, as plain text: no code fence, no prompt marker, nothing after it. One command runs per reply.',
    '- The host runs it and sends the result back as your next message, starting with "Output of" and the command. Read it, then issue the next command or give the final answer.',
    '- A command that is not allowed or is disabled returns its refusal as that output; do not retry it.',
    `- At most ${String(maxSteps)} commands run for one request. When the task is done, reply with the final answer and no trailing command.`,
  ].join('\n');
}
