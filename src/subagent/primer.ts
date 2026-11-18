export const SUBAGENT_PRIMER = [
  'You can hand a task to another agent with the subagent command.',
  String.raw`Write it as one line of JSON with a "role" (the role name), a "task" (an existing AI task file), and an optional "context" (extra directions). Encode newlines inside strings as \n so the whole command stays on one line.`,
  'The command returns no output immediately and does not block you. Its results arrive later as new prompts, each holding one JSON object on a single line.',
  'A started message has "status":"started" and the fields "role" (the canonical role name), "sessionId", and "callerId". It means the subagent is running in the background.',
  'A completion message has "status", "sessionId", "callerId", and "output". The sessionId is the provider session id and may be null on a failed completion when no session started. The started message may be skipped when its completion overtakes it.',
  'Completion statuses: "completed" means it finished successfully; "partial" means it was stopped at the tool-loop limit; "failed" means the output is the source error; "terminated" means it was stopped.',
  'The subagent finishes with a self-contained final result, delivered as the completion output. No role list is supplied here; the role is named by the task or by you.',
].join('\n');

export function isSubagentCommandLine(line: string): boolean {
  const text = line.trimStart();
  const end = text.search(/\s/);
  const first = end === -1 ? text : text.slice(0, end);
  return first.toLowerCase() === 'subagent';
}

export function subagentTaskPrompt(taskText: string, context?: string): string {
  return [
    'You are a subagent. Complete the task below and finish with a self-contained final result for the agent that launched you.',
    taskText,
    ...(context === undefined ? [] : [context]),
  ].join('\n\n');
}
