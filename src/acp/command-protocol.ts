export function commandProtocolPrimer(maxSteps: number): string {
  return [
    'How commands work:',
    '- To run a command, put it inside a fenced block whose info string is exactly `janissary`. Several such blocks in one reply form a batch; each block holds one command, whose arguments may span several lines. You may write prose after the blocks. A command on a bare line outside a block is just your answer, not a command.',
    '- All commands in a batch run in parallel. Each result comes back as its own message starting with "Output of" and the command. Read it, then send another batch or give the final answer.',
    '- A command that is not allowed, is disabled, or is skipped because the step limit was reached returns its refusal as that output; do not retry it.',
    `- At most ${String(maxSteps)} commands run for one request, counting every command in a batch. When the task is done, reply with the final answer and no trailing command.`,
  ].join('\n');
}
