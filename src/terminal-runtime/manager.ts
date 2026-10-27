import type { Managers } from '../managers.js';
import { shellRuntime, sshRuntime } from '../harness/observers.js';
import type { HarnessRuntime } from '../harness/runtime.js';
import { HarnessRuntimes } from '../harness/runtime-registry.js';
import { liveRecordingOf } from '../harness/runtime-access.js';
import type { TerminalColors } from '../harness/terminal-colors.js';
import { SHELL_PROGRAM } from '../plugins/shell/shared.js';

export class TerminalRuntimeManager {
  private readonly runtimes = new HarnessRuntimes();

  constructor(private readonly managers: Managers) {}

  install(id: string, label: string, runtime: HarnessRuntime): void {
    this.runtimes.install(id, label, runtime);
  }

  get(id: string): HarnessRuntime | undefined {
    return this.runtimes.get(id);
  }

  closeTab(label: string): void {
    this.runtimes.closeTab(label);
  }

  dispose(): void {
    this.runtimes.dispose();
  }

  registerSshObservers(id: string, label: string, command: string): void {
    this.install(id, label, sshRuntime(this.managers, id, label, command));
  }

  registerShellObservers(id: string, label: string): void {
    this.install(id, label, shellRuntime(this.managers, id, label, SHELL_PROGRAM));
  }

  liveRecordingPathOf(label: string): string | undefined {
    return liveRecordingOf(this.managers, this.runtimes, label);
  }

  reportTerminalColors(id: string, colors: TerminalColors): void {
    this.runtimes.get(id)?.recorder?.setColors(colors);
  }
}
