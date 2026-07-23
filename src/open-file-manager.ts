import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { openerForExtension, type OpenContext } from './openers/index.js';
import { didOsOpen } from './openers/os-open.js';
import { openInEditor } from './openers/editor.js';
import { nextFreeName } from './editor/next-free-name.js';
import { expandUserPath } from './paths.js';
import { SHELL_NAME } from './shell-manager.js';
import type { Managers } from './managers.js';
import { runOpenCommand } from './open-file-command.js';
import { getConfig } from './config.js';
import { humanSize } from './openers/size.js';
import { messageBus } from './bus.js';
import { isSyncedPath } from './sync-path-match.js';

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
    const context = this.buildContext(command, label);
    if (this.isSyncPath(file)) { this.openSynced(file, context, line); return; }
    openInEditor(file, context, line);
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

  newDirectory(target: string, label: string): void {
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    const expanded = expandUserPath(target, { root: this.managers.tab.launchDir });
    const directory = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
    const parent = path.dirname(directory);
    const resolved = path.join(parent, nextFreeName(parent, path.basename(directory)));
    mkdirSync(resolved);
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
    if (!external && opener.name === 'editor' && this.isSyncPath(file)) { this.openSynced(file, context); return; }
    void (external ? opener.external(file, context) : opener.inline(file, context));
  }

  // Whether `file`'s project-relative path is config-listed for GitHub syncing — the sole gate for
  // the entire feature (see `git-sync.ts`); there is no UI toggle.
  private isSyncPath(file: string): boolean {
    const launchDir = this.managers.tab.launchDir;
    if (!launchDir) return false;
    const relative = path.relative(launchDir, file).split(path.sep).join('/');
    return isSyncedPath(relative, getConfig().syncPaths);
  }

  // Mirrors `HarnessManager.spawnTab`/`finishSpawn`'s immediate-placeholder-then-async-fill-in
  // pattern: the tab opens right away, targeting the file's eventual location inside the shared
  // sync workspace, showing `sync: 'provisioning'` until that workspace (and an initial pull) is
  // ready — at which point the real size/content become available and the tab is filled in.
  private openSynced(file: string, context: OpenContext, line?: number): void {
    const relative = path.relative(this.managers.tab.launchDir, file).split(path.sep).join('/');
    const target = this.managers.gitSync.workspaceFilePath(relative);
    context.openEditorTab({
      name: path.basename(target), path: target, size: 'unknown', url: context.registerFile(target), line, sync: 'provisioning',
    });
    void this.finishOpenSynced(target, context);
  }

  private async finishOpenSynced(target: string, context: OpenContext): Promise<void> {
    const result = await this.managers.gitSync.openSync();
    const tab = this.managers.tab.tabs.find((t) => t.editor?.path === target);
    if (!tab?.editor) return;
    if ('error' in result) {
      tab.editor = { ...tab.editor, sync: 'error' };
      messageBus.emit('state', { type: 'dirty' });
      return;
    }
    let size = 'unknown';
    try { size = humanSize(statSync(target).size); } catch { /* not yet created on disk */ }
    tab.editor = { ...tab.editor, size, url: context.registerFile(target), sync: 'synced' };
    this.managers.editorWatch.watch(tab.label, target);
    messageBus.emit('state', { type: 'dirty' });
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
