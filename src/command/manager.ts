import { randomUUID } from 'node:crypto';
import { resolveInTab } from './resolve-in-tab.js';
import { findCommand } from '../commands/index.js';
import { recordGlobalHistory } from '../global-history.js';
import type { Managers } from '../managers.js';
import { errorText } from '../error-text.js';
import { executeAndCapture } from '../capture/execute-and-capture.js';
import type { CommandInvocationContext } from '../commands/types.js';
import { tabRuntime } from '../tab/runtime.js';

const DISPATCH_CAPTURE_LIMIT_MS = 30_000;

export class CommandManager {
  constructor(private managers: Managers) {}

  dispatch(text: string): void {
    const trimmed = this.managers.tab.recordHistory(this.managers.tab.activeTab, text);
    if (trimmed) recordGlobalHistory(trimmed, this.managers.tab.cur().label);
    this.run(trimmed, this.managers.tab.cur().label, this.managers.tab.activeTab);
  }

  dispatchTo(label: string, text: string): void {
    const index = this.managers.tab.findIndex(label);
    if (index === -1) return;
    const trimmed = this.managers.tab.recordHistory(index, text);
    if (trimmed) recordGlobalHistory(trimmed, label);
    this.run(trimmed, label, index);
  }

  private run(input: string, label: string, index: number): void {
    const res = resolveInTab(input, label, this.managers);
    switch (res.kind) {
      case 'empty': { return;
      }
      case 'output':
      case 'unknown': { this.managers.tab.append(label, { input, output: res.output, markdown: res.kind === 'output' }); return;
      }
      case 'app': { void this.executeCommand(res.name, res.cmd, label, index); return;
      }
    }
  }

  // Offers one line to the ordinary dispatcher and answers whether the application claimed it, with
  // the output it added to the tab.
  //
  // Deliberately narrower than `run`: a resolution to the `shell` route or to nothing at all is not
  // an application command, so both report `false` and the caller decides what they mean. What counts
  // as claimed is a registry entry or a built-in that answers with output — the two kinds `run`
  // handles without a shell in the middle.
  //
  // The wait is bounded because nothing else bounds it: the plugin asking is not charged for the
  // command's runtime, so a command that never finishes would otherwise hold the caller forever.
  async dispatchLineWithOutput(
    label: string,
    input: string,
    captureLimitMs = DISPATCH_CAPTURE_LIMIT_MS,
  ): Promise<{ dispatched: boolean; output: string; coreResponse?: boolean; result?: unknown }> {
    return this.dispatchLine(label, input, captureLimitMs, this.createInvocationContext(label));
  }

  async dispatchQueuedLine(
    label: string,
    input: string,
    systemSchedule?: CommandInvocationContext['systemSchedule'],
  ): Promise<{ dispatched: boolean; output: string; coreResponse?: boolean; result?: unknown }> {
    const invocation = this.createInvocationContext(label);
    const withProvenance = systemSchedule
      ? Object.freeze({ ...invocation, systemSchedule: Object.freeze({ ...systemSchedule }) })
      : invocation;
    return this.dispatchLine(label, input, DISPATCH_CAPTURE_LIMIT_MS, withProvenance);
  }

  async dispatchLineInInvocation(
    label: string,
    input: string,
    parent: CommandInvocationContext,
    captureLimitMs = DISPATCH_CAPTURE_LIMIT_MS,
  ): Promise<{ dispatched: boolean; output: string; coreResponse?: boolean; result?: unknown }> {
    return this.dispatchLine(label, input, captureLimitMs, this.childInvocationContext(parent));
  }

  private async dispatchLine(
    label: string,
    input: string,
    captureLimitMs: number,
    invocation: CommandInvocationContext,
  ): Promise<{ dispatched: boolean; output: string; coreResponse?: boolean; result?: unknown }> {
    const resolution = resolveInTab(input, label, this.managers);
    if (resolution.kind === 'output') {
      this.managers.tab.append(label, { input, output: resolution.output, markdown: true });
      return { dispatched: true, output: resolution.output };
    }
    if (resolution.kind !== 'app' || resolution.name === 'shell') return { dispatched: false, output: '' };

    const command = findCommand(resolution.name, resolution.cmd);
    if (command?.coreResponse) {
      const result = await this.executeCommandWithContext(
        resolution.name, resolution.cmd, label, this.managers.tab.findIndex(label), invocation,
      );
      return { dispatched: true, output: '', coreResponse: true, ...(result !== undefined && { result }) };
    }
    if (command?.structuredResult) {
      let execution: Promise<unknown> | undefined;
      const output = await executeAndCapture(label, async () => {
        execution = this.executeCommandWithContext(
          resolution.name, resolution.cmd, label, this.managers.tab.findIndex(label), invocation,
        );
        await execution;
      }, undefined, invocation.invocationId);
      const result = await execution;
      return { dispatched: true, output: output.join('\n'), ...(result !== undefined && { result }) };
    }

    let result: unknown;
    const output = await executeAndCapture(label, async () => {
      result = await this.executeCommandWithContext(
        resolution.name, resolution.cmd, label, this.managers.tab.findIndex(label), invocation,
      );
    }, captureLimitMs, invocation.invocationId);
    return result === undefined
      ? { dispatched: true, output: output.join('\n') }
      : { dispatched: true, output: '', result };
  }

  async executeCommand(name: string, command: string, label: string, index: number): Promise<unknown> {
    return this.executeCommandWithContext(name, command, label, index, this.createInvocationContext(label));
  }

  private async executeCommandWithContext(
    name: string,
    command: string,
    label: string,
    index: number,
    invocation: CommandInvocationContext,
  ): Promise<unknown> {
    const cmd = findCommand(name, command);
    if (!cmd) return undefined;
    if (cmd.available?.(label, this.managers) === false) {
      this.run(command, label, index);
      return;
    }
    const existingTabs = new Set(this.managers.tab.tabs.map((tab) => tab.label));
    try {
      const result = await cmd.run(command, { label, index }, this.managers, invocation);
      this.trackRunTabs(invocation.runId, existingTabs);
      return result;
    } catch (error) {
      this.trackRunTabs(invocation.runId, existingTabs);
      const output = errorText(error);
      this.managers.tab.appendForInvocation(label, { input: command, output }, invocation.invocationId);
      return undefined;
    }
  }

  private trackRunTabs(runId: string, existingTabs: ReadonlySet<string>): void {
    if (!this.managers.agent?.runs.has(runId)) return;
    for (const tab of this.managers.tab.tabs) {
      if (!existingTabs.has(tab.label)) this.managers.agent.trackCreatedTab(runId, tab.label);
    }
  }

  private createInvocationContext(label: string): CommandInvocationContext {
    const tab = this.managers.tab.byLabel(label);
    const runtime = tab ? tabRuntime(tab) : undefined;
    return Object.freeze({
      runId: randomUUID(),
      invocationId: randomUUID(),
      caller: Object.freeze({
        label,
        ...(runtime?.incarnation && { incarnation: runtime.incarnation }),
        cwd: runtime?.cwd ?? this.managers.tab.launchDir,
        context: Object.freeze([...(runtime?.context ?? [])]),
      }),
      signal: new AbortController().signal,
    });
  }

  private childInvocationContext(parent: CommandInvocationContext): CommandInvocationContext {
    return Object.freeze({
      runId: parent.runId,
      invocationId: randomUUID(),
      caller: parent.caller,
      signal: parent.signal,
      ...(parent.awaitResult && { awaitResult: true }),
      ...(parent.systemSchedule && { systemSchedule: parent.systemSchedule }),
    });
  }
}
