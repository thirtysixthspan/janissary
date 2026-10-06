import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZSHENV, ZSHRC } from './zsh-startup-script.js';

const FILES: ReadonlyArray<readonly [string, string]> = [['.zshenv', ZSHENV], ['.zshrc', ZSHRC]];

// The `ZDOTDIR` every shell tab's zsh is spawned with, owned by the shell plugin's activation and
// removed by its `dispose`. A fresh `mkdtemp` directory rather than a fixed path: zsh runs whatever it
// finds there, so a predictable name in a shared temp directory would let anyone who planted files
// there run code in the user's shell. It sits outside `$HOME`, which a workspace's sandbox can read.
// The files hold no secret — the nonce reaches zsh through its environment — so one directory serves
// every shell.
export class ZshStartupDirectory {
  private directory: string | undefined;

  constructor(private readonly parent: string = tmpdir()) {}

  // Created on the first shell, and again if something has since removed it: a `ZDOTDIR` with no files
  // in it would start a shell that ran none of the user's startup files and installed no hooks.
  path(): string {
    const current = this.directory;
    if (current !== undefined && FILES.every(([name]) => existsSync(path.join(current, name)))) return current;
    this.dispose();
    const directory = mkdtempSync(path.join(this.parent, 'janus-zsh-'));
    for (const [name, content] of FILES) writeFileSync(path.join(directory, name), content, { mode: 0o600 });
    this.directory = directory;
    return directory;
  }

  dispose(): void {
    if (this.directory === undefined) return;
    rmSync(this.directory, { recursive: true, force: true });
    this.directory = undefined;
  }
}
