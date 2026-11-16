import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { applyPatchText } from './apply.js';

describe('applyPatchText', () => {
  let root: string;
  beforeEach(() => { root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'patch-apply-'))); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  function write(name: string, text: string | Buffer): void {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  function read(name: string): string { return readFileSync(path.join(root, name), 'utf8'); }
  function apply(text: string): string { return applyPatchText(root, text); }

  it('applies the mixed example and reports its rows in order', () => {
    write('src/a.ts', 'const a = 1;\nconst b = 2;\n'); write('src/x.ts', 'export const x = 1;\n'); write('old.txt', 'old\n');
    expect(apply('*** Begin Patch\n*** Add File: notes/new/todo.md\n+# Todo\n*** Update File: src/a.ts\n@@\n const a = 1;\n-const b = 2;\n+const b = 3;\n*** Update File: src/x.ts\n*** Move to: src/y.ts\n*** Delete File: old.txt\n*** End Patch'))
      .toBe('Patched 4 files:\nA notes/new/todo.md\nM src/a.ts\nR src/x.ts -> src/y.ts\nD old.txt');
    expect(read('notes/new/todo.md')).toBe('# Todo\n');
    expect(read('src/a.ts')).toBe('const a = 1;\nconst b = 3;\n');
    expect(read('src/y.ts')).toBe('export const x = 1;\n');
    expect(existsSync(path.join(root, 'src/x.ts'))).toBe(false);
    expect(existsSync(path.join(root, 'old.txt'))).toBe(false);
  });

  it('handles moves with hunks, replacement, cancellation and counts', () => {
    write('a', 'old\n');
    expect(apply('*** Update File: a\n*** Move to: b\n@@\n-old\n+new')).toBe('Patched 1 file:\nR a -> b');
    expect(read('b')).toBe('new\n');
    expect(apply('*** Delete File: b\n*** Add File: b\n+replaced')).toBe('Patched 1 file:\nM b');
    expect(read('b')).toBe('replaced\n');
    expect(apply('*** Add File: temp\n+x\n*** Delete File: temp')).toBe('Patched 0 files:');
    expect(existsSync(path.join(root, 'temp'))).toBe(false);
    expect(apply('*** Add File: c\n+x\n*** Add File: d\n+y')).toBe('Patched 2 files:\nA c\nA d');
  });

  it('fails atomically on a later mismatch and reports structural failures', () => {
    write('src/a.ts', 'const a = 1;\nconst b = 2;\n');
    expect(apply('*** Add File: z.md\n+hi\n*** Update File: src/a.ts\n@@\n const a = 1;\n-const b = 99;\n+const b = 4;'))
      .toBe('Patch failed at section 2 (Update File: src/a.ts): No matching text for hunk starting "const a = 1;". No files were changed.');
    expect(existsSync(path.join(root, 'z.md'))).toBe(false);
    expect(read('src/a.ts')).toBe('const a = 1;\nconst b = 2;\n');
    expect(apply('*** Rename File: x')).toBe('Malformed patch at line 1: unknown marker "*** Rename File: x". No files were changed.');
    expect(apply('*** Delete File: ../outside.txt')).toBe('Patch failed at section 1 (Delete File: ../outside.txt): Outside the workspace. No files were changed.');
  });

  it('reports existence, protection, directory, encoding and size failures', () => {
    write('existing', 'old'); write('binary', Buffer.from([0xff])); write('large', 'x'.repeat(FILE_POLICY_MAX_BYTES + 1));
    mkdirSync(path.join(root, 'dir'));
    for (const [text, marker, reason] of [
      ['*** Add File: existing\n+x', 'Add File: existing', 'File already exists'],
      ['*** Delete File: missing', 'Delete File: missing', 'File not found'],
      ['*** Update File: missing\n@@\n-x\n+y', 'Update File: missing', 'File not found'],
      ['*** Add File: .git/x\n+x', 'Add File: .git/x', 'Protected file'],
      ['*** Delete File: .janissary/x', 'Delete File: .janissary/x', 'Protected file'],
      ['*** Delete File: dir', 'Delete File: dir', 'Is a directory'],
      ['*** Delete File: binary', 'Delete File: binary', 'Not a text file'],
      ['*** Delete File: large', 'Delete File: large', 'File too large (>5 MB)'],
    ]) expect(apply(text)).toBe(`Patch failed at section 1 (${marker}): ${reason}. No files were changed.`);
  });

  it('preserves modes, removes only a link, and leaves emptied folders', () => {
    write('dir/a', 'old\n'); chmodSync(path.join(root, 'dir/a'), 0o640);
    symlinkSync('dir/a', path.join(root, 'link'));
    expect(apply('*** Update File: dir/a\n@@\n-old\n+new')).toBe('Patched 1 file:\nM dir/a');
    expect(statSync(path.join(root, 'dir/a')).mode & 0o777).toBe(0o640);
    expect(apply('*** Delete File: link')).toBe('Patched 1 file:\nD link');
    expect(read('dir/a')).toBe('new\n');
    expect(existsSync(path.join(root, 'link'))).toBe(false);
    expect(apply('*** Delete File: dir/a')).toBe('Patched 1 file:\nD dir/a');
    expect(lstatSync(path.join(root, 'dir')).isDirectory()).toBe(true);
  });

  it('escapes a path and a mismatch line in failure output', () => {
    write('a\tb', 'old\n');
    expect(apply('*** Update File: a\tb\n@@\n-wrong\tline\n+new'))
      .toBe(String.raw`Patch failed at section 1 (Update File: a\tb): No matching text for hunk starting "wrong\tline". No files were changed.`);
  });

  it('restores earlier changes after an intermediate-hop collision', () => {
    write('a', 'old\n');
    const result = apply('*** Update File: a\n*** Move to: x/b\n*** Update File: x/b\n*** Move to: c\n*** Add File: x\n+new');
    expect(result.startsWith('Patch failed while applying: ')).toBe(true);
    expect(result.endsWith(': x. No files were changed.')).toBe(true);
    expect(read('a')).toBe('old\n');
  });
});
