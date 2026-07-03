import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { openerForExtension, type OpenContext } from './openers/index.js';
import { didOsOpen } from './openers/os-open.js';
import { openInEditor } from './openers/editor.js';
import { parseOpen, isGlobPattern } from './commands/open.js';
import { webOpener } from './openers/page.js';
import { SHELL_NAME } from './shell-manager.js';
import type { Managers } from './managers.js';
import { TabManager } from './tab-manager.js';

export class OpenFileManager {
  constructor(private managers: Managers) {}

  run(command: string, label: string): void {
    const parsed = parseOpen(command);
    if ('error' in parsed) { this.managers.tab.append(label, { input: command, output: parsed.error }); return; }
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    const context = this.buildContext(command, label);

    if (parsed.web) {
      void (parsed.external ? webOpener.external(parsed.target, context) : webOpener.inline(parsed.target, context));
      return;
    }

    if (isGlobPattern(parsed.target)) {
      const matches = this.expandGlob(parsed.target, cwd);
      if (matches.length === 0) { this.managers.tab.append(label, { input: command, output: `open: ${parsed.target}: no matching files` }); return; }
      const files = matches.slice(0, TabManager.OPEN_MAX_FILES);
      if (matches.length > files.length) {
        this.managers.tab.append(label, { input: command, output: `Opening the first ${files.length} of ${matches.length} matching files.` });
      }
      for (const file of files) this.openOne(command, label, file, parsed.external, context);
      return;
    }

    const file = path.isAbsolute(parsed.target) ? parsed.target : path.resolve(cwd, parsed.target);
    this.openOne(command, label, file, parsed.external, context);
  }

  // The `edit <file>` command: resolve the target like `open` does, but bypass the opener
  // registry and hand the file straight to the editor — this is how markdown and extensionless
  // files (Makefile, .gitignore) get edited.
  edit(command: string, target: string, label: string): void {
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    const file = path.isAbsolute(target) ? target : path.resolve(cwd, target);
    openInEditor(file, this.buildContext(command, label));
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
