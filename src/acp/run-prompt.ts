import type { Managers } from '../managers.js';
import type { AcpSession } from './types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { LogEntry, TabRuntime } from '../tab/types.js';
import { runAcpToolLoop } from './loop.js';
import { guardAcpHandlers } from './guard-handlers.js';
import { appendAcp, settleAcpPrompt } from './response.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import { isRateLimitError } from './rate-limit.js';
import { createAcpToolTable, toolPrimer, toolRunner, toolExtractor } from './tool-table.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { coreActivity } from './record-feed.js';
import { acpRoleRuntime } from './role-state.js';

export function runCorePrompt(
  managers: Managers, label: string, runtime: TabRuntime, request: AcpPendingPrompt,
  session: AcpSession, identity: string, current: () => boolean,
): void {
  const roleState = acpRoleRuntime(runtime, request.role);
  const active = () => current() && roleState.prompt === request && !request.abort.signal.aborted;
  const updateRunning = (output: string, running: boolean) => {
    managers.tab.updateRunning(label, { markdown: true, entries: request.runningEntries }, output, running, { trailing: true });
  };
  const tools = runtime.acpWithoutTools === true ? [] : createAcpToolTable(
    managers, request.roleName, request.commands, request.abort.signal,
  );
  const runCommand = toolRunner(tools, request.roleName, request.commands, label);
  const recordTool = (text: string) => coreActivity(managers.acpRecords, runtime, 'tool', text, request.role);
  const recordAsyncResult = async (result: Promise<string>) => {
    const text = await result;
    if (active()) recordTool(text);
    return text;
  };
  let lastAnswer = '';
  runAcpToolLoop({
    prompt: (text, handlers) => {
      if (!active()) return;
      session.prompt(text, {
        onChunk: (chunk) => { if (active()) handlers.onChunk(chunk); },
        onEnd: (reason) => { if (active()) handlers.onEnd(reason); },
        onError: (message) => { if (active()) handlers.onError(message); },
      });
    },
  }, request.prompt, {
    signal: request.abort.signal,
    primer: [toolPrimer(tools, request.commands), MARKDOWN_INSTRUCTION].filter(Boolean).join('\n\n'),
    runCommand: (command) => {
      if (!active()) throw new Error('ACP: prompt cancelled.');
      recordTool(command);
      const result = runCommand(command);
      if (!(result instanceof Promise)) {
        if (active()) recordTool(result);
        return result;
      }
      return recordAsyncResult(result);
    },
    extractCommand: toolExtractor(tools),
  }, guardAcpHandlers({
    startTurn: (isFirst) => {
      managers.tab.addBusy(label);
      if (isFirst) notify(managers, 'agent-start', label);
      const entry: LogEntry = { input: isFirst ? request.prompt : '', output: '', running: true, markdown: true };
      request.runningEntries.add(entry);
      appendAcp(managers, label, entry);
    },
    chunk: (buffer) => updateRunning(buffer, true),
    endTurn: (final) => { updateRunning(final, false); lastAnswer = final; request.replied = true; },
    ranCommand: (command, result) => appendAcp(managers, label, { input: command, output: result, acp: true }),
    finished: (reason, maxSteps) => {
      notify(managers, 'state-change', label);
      if (isRateLimitError(lastAnswer)) notify(managers, 'rate-limited', label);
      const reply = reason === 'capped'
        ? `${lastAnswer}${lastAnswer ? '\n\n' : ''}(stopped after ${maxSteps} tool steps)`
        : lastAnswer;
      messageBus.emit('state', { type: 'dirty' });
      settleAcpPrompt(managers, label, { answered: true, reply, session: identity }, undefined, request.role);
    },
    error: (message) => {
      const error = `ACP error: ${message}`;
      updateRunning(error, false);
      notify(managers, 'state-change', label);
      if (isRateLimitError(message)) notify(managers, 'rate-limited', label);
      request.modelFailed = true;
      settleAcpPrompt(managers, label, { answered: false, error }, undefined, request.role);
    },
  }, active));
}
