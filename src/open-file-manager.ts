import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { openerForExtension, type OpenContext } from './openers/index.js';
import { didOsOpen } from './openers/os-open.js';
import { openInEditor } from './openers/editor.js';
import { nextFreeName } from './editor/next-free-name.js';
import { expandUserPath } from './paths.js';
import { SHELL_NAME } from './shell-manager.js';
import type { Managers } from './managers.js';
import { runOpenCommand } from './open-file-command.js';

export class OpenFileManager {
  constructor(private managers: Managers) {}

  run(command: string, label: string): void {
    runOpenCommand(
      this.managers, command, label,
      (c, l) => this.buildContext(c, l), (p, cwd) => this.expandGlob(p, cwd), (c, l, f, ext, ctx) => this.openOne(c, l, f, ext, ctx),
    );
  }

  // The `edit <file>` command: resolve the target like `open` does, but bypass the opener
  // registry and hand the file straight to the editor — this is how markdown and extensionless
  // files (Makefile, .gitignore) get edited.
  edit(command: string, target: string, label: string, line?: number): void {
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    const expanded = expandUserPath(target, { root: this.managers.tab.launchDir });
    const file = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
    openInEditor(file, this.buildContext(command, label), line);
  }

  // The file navigator's "New file" button / Cmd+N: like `edit`, but resolves to the next free
  // `<base>-N<ext>` name first, so creating a second new file in a directory that already has
  // `untitled.md` opens `untitled-2.md` instead of reopening the existing one.
  newFile(command: string, target: string, label: string): void {
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    const expanded = expandUserPath(target, { root: this.managers.tab.launchDir });
    const file = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
    const dir = path.dirname(file);
    const resolved = path.join(dir, nextFreeName(dir, path.basename(file)));
    openInEditor(resolved, this.buildContext(command, label));
  }

  private buildContext(command: string, label: string): OpenContext {
    return {
      note: (text) => this.managers.tab.append(label, { input: command, output: text }),
      openImageTab: (image) => this.managers.tab.openImageTab(image),
      openMarkdownTab: (view) => this.managers.tab.openMarkdownTab(view),
      openEditorTab: (view) => this.managers.tab.openEditorTab(view),
      openPageTab: (view) => this.managers.tab.openPageTab(view),
      registerFile: (absPath) => this.managers.tab.registerFile(absPath),
      openExternally: (absPath) => didOsOpen(absPath),
    };
  }

  private openOne(command: string, label: string, file: string, external: boolean, context: OpenContext): void {
    if (!existsSync(file)) { this.managers.tab.append(label, { input: command, output: `open: ${file}: no such file` }); return; }
    const opener = openerForExtension(path.extname(file));
    if (!opener) { this.managers.tab.append(label, { input: command, output: `No opener for "${path.extname(file) || '(none)'}" files.` }); return; }
    void (external ? opener.external(file, context) : opener.inline(file, context));
  }

  private expandGlob(pattern: string, cwd: string): string[] {
    let stdout: string;
    try {
      const res = spawnSync(SHELL_NAME, ['-c', String.raw`for f in ${pattern}; do printf '%s\n' "$f"; done`], {
        cwd, encoding: 'utf8', timeout: 5000,
      });
      stdout = res.stdout ?? '';
    } catch { return []; }
    const files = stdout.split('\n').map((s) => s.trim()).filter(Boolean)
      .map((p) => (path.isAbsolute(p) ? p : path.resolve(cwd, p)))
      .filter((p) => { try { return statSync(p).isFile(); } catch { return false; } });
    return [...new Set(files)].toSorted((a, b) => a.localeCompare(b));
  }
}
