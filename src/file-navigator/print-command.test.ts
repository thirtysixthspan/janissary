import { describe, expect, it } from 'vitest';
import { formatFilesCommand, type FilesCommandView } from './print-command.js';

function view(overrides: Partial<FilesCommandView> = {}): FilesCommandView {
  return {
    root: '/project/web',
    launchDir: '/project',
    details: 'name',
    expanded: [],
    ...overrides,
  };
}

describe('formatFilesCommand', () => {
  it('prints a complete local view in its fixed clause order', () => {
    expect(formatFilesCommand(view({
      dock: 'left',
      details: 'size',
      expanded: ['src/my dir', 'src'],
      selection: { cursor: 'src/a.ts', anchor: 'src/a.ts', selected: ['src/a.ts', 'src/b.ts'] },
    }))).toBe('files on left with size expand src expand "src/my dir" cursor src/a.ts anchor src/a.ts select src/a.ts select src/b.ts $root/web');
  });

  it('omits name mode and absent selection parts', () => {
    expect(formatFilesCommand(view({
      selection: { selected: [] },
    }))).toBe('files $root/web');
  });

  it('prints sorted expanded folders even when a nested folder is hidden by a collapsed parent', () => {
    expect(formatFilesCommand(view({ expanded: ['z', 'src/closed/deep', 'src', 'a'] })))
      .toBe('files expand a expand src expand src/closed/deep expand z $root/web');
  });

  it('prints the root itself, a home path, and an absolute path in their supported forms', () => {
    expect(formatFilesCommand(view({ root: '/project', launchDir: '/project' }))).toBe('files $root/');
    expect(formatFilesCommand(view({ root: '/home/user/project', launchDir: '/project', home: '/home/user' })))
      .toBe('files ~/project');
    expect(formatFilesCommand(view({ root: '/opt/project', launchDir: '/project' }))).toBe('files /opt/project');
  });

  it('keeps the .janissary segment in a local root', () => {
    expect(formatFilesCommand(view({ root: '/project/.janissary/workspace/claude' })))
      .toBe('files $root/.janissary/workspace/claude');
  });

  it('prints the remote owner and root without local view clauses', () => {
    expect(formatFilesCommand(view({
      root: '/remote/workspace/src',
      dock: 'right',
      details: 'modified',
      expanded: ['src'],
      selection: { cursor: 'src/a.ts', selected: ['src/a.ts'] },
      remote: { ownerLabel: 'remote-tab', root: '/remote/workspace' },
    }))).toBe('files in remote-tab on right with modified $root/src');
  });

  it('quotes and escapes paths containing spaces or quotes', () => {
    expect(formatFilesCommand(view({
      expanded: ['my dir', 'a"b', "it's.md"],
      selection: { cursor: 'my dir/a"b', selected: [] },
    }))).toBe(String.raw`files expand "a\"b" expand "it's.md" expand "my dir" cursor "my dir/a\"b" $root/web`);
  });
});
