export function commandProtocolPrimer(maxSteps: number): string {
  return [
    'How commands work:',
    '- To run a command, put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a prompt marker; its arguments can span several lines. You may write prose after the block. A command on a bare line outside the block is just your answer, not a command. One command runs per reply.',
    '- The host runs it and sends the result back as your next message, starting with "Output of" and the command. Read it, then issue the next command or give the final answer.',
    '- A command that is not allowed or is disabled returns its refusal as that output; do not retry it.',
    `- At most ${String(maxSteps)} commands run for one request. When the task is done, reply with the final answer and no trailing command.`,
  ].join('\n');
}
