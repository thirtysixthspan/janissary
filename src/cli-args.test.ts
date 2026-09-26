import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parseCliArgs, CliUsageError } from './cli-args.js';
import { usageText, appVersion, appVersionNumber } from './cli-info.js';

let tmpDir: string;
let tmpFile: string;

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'cli-args-test-'));
  tmpFile = path.join(tmpDir, 'not-a-dir.txt');
  writeFileSync(tmpFile, 'x');
});

describe('parseCliArgs', () => {
  it('returns all defaults for an empty argv', () => {
    const args = parseCliArgs([]);
    expect(args.help).toBe(false);
    expect(args.version).toBe(false);
    expect(args.relaunch).toBe(false);
    expect(args.noOpen).toBe(false);
    expect(args.port).toBeUndefined();
    expect(args.projectDir).toBeUndefined();
  });

  it('parses --help', () => {
    expect(parseCliArgs(['--help']).help).toBe(true);
  });

  it('parses --version', () => {
    expect(parseCliArgs(['--version']).version).toBe(true);
  });

  it('parses --port=3000', () => {
    expect(parseCliArgs(['--port=3000']).port).toBe(3000);
  });

  it('leaves port undefined when absent', () => {
    expect(parseCliArgs([]).port).toBeUndefined();
  });

  it('parses --relaunch', () => {
    expect(parseCliArgs(['--relaunch']).relaunch).toBe(true);
  });

  it('parses --no-open', () => {
    expect(parseCliArgs(['--no-open']).noOpen).toBe(true);
  });

  it('parses multiple flags together', () => {
    const args = parseCliArgs(['--relaunch', '--no-open', '--port=8080']);
    expect(args.relaunch).toBe(true);
    expect(args.noOpen).toBe(true);
    expect(args.port).toBe(8080);
    expect(args.help).toBe(false);
    expect(args.version).toBe(false);
  });

  it('throws CliUsageError on unknown flag', () => {
    expect(() => parseCliArgs(['--no-opne'])).toThrow(CliUsageError);
  });

  it('throws CliUsageError on bare --port', () => {
    expect(() => parseCliArgs(['--port'])).toThrow(CliUsageError);
  });

  it('throws CliUsageError on --port=abc', () => {
    expect(() => parseCliArgs(['--port=abc'])).toThrow(CliUsageError);
  });

  it('throws CliUsageError on --port=0', () => {
    expect(() => parseCliArgs(['--port=0'])).toThrow(CliUsageError);
  });

  it('throws CliUsageError on --port=70000', () => {
    expect(() => parseCliArgs(['--port=70000'])).toThrow(CliUsageError);
  });

  it('throws CliUsageError on positional argument', () => {
    expect(() => parseCliArgs(['foo'])).toThrow(CliUsageError);
  });

  it('parses a positional project directory to the resolved absolute path', () => {
    expect(parseCliArgs([tmpDir]).projectDir).toBe(tmpDir);
  });

  it('recognizes `stop` as a subcommand with no project directory', () => {
    const args = parseCliArgs(['stop']);
    expect(args.stop).toBe(true);
    expect(args.projectDir).toBeUndefined();
  });

  it('recognizes `stop <project-dir>` without raising the unexpected-argument error', () => {
    const args = parseCliArgs(['stop', tmpDir]);
    expect(args.stop).toBe(true);
    expect(args.projectDir).toBe(tmpDir);
  });

  it('leaves stop false for a normal invocation', () => {
    expect(parseCliArgs([]).stop).toBe(false);
    expect(parseCliArgs([tmpDir]).stop).toBe(false);
  });

  // `e2e-browser` is recognized before any option parsing, because `--port` and `--dir` are its own
  // arguments and strict mode would reject them as unknown options. They are handed on verbatim for
  // `parseE2EBrowserArgs` to read, which is the only thing that validates them.
  it('recognizes `e2e-browser` and hands its arguments on untouched', () => {
    const args = parseCliArgs(['e2e-browser', '--port', '50000', '--dir', tmpDir]);

    expect(args.e2eBrowser).toBe(true);
    expect(args.e2eBrowserArgs).toEqual(['--port', '50000', '--dir', tmpDir]);
  });

  it('accepts `e2e-browser` with no arguments of its own', () => {
    const args = parseCliArgs(['e2e-browser']);

    expect(args.e2eBrowser).toBe(true);
    expect(args.e2eBrowserArgs).toEqual([]);
  });

  it('leaves e2eBrowser false for a normal invocation', () => {
    expect(parseCliArgs([]).e2eBrowser).toBe(false);
    expect(parseCliArgs([tmpDir]).e2eBrowser).toBe(false);
  });

  it('does not treat a project directory named e2e-browser as the subcommand', () => {
    // The subcommand is only the keyword in first position; anywhere else it is an ordinary path.
    const named = path.join(tmpDir, 'e2e-browser');
    mkdirSync(named);
    const args = parseCliArgs([named]);

    expect(args.e2eBrowser).toBe(false);
    expect(args.projectDir).toBe(named);
  });

  it('gives an e2e-browser invocation every other default', () => {
    const args = parseCliArgs(['e2e-browser', '--port', '1']);

    expect(args.help).toBe(false);
    expect(args.stop).toBe(false);
    expect(args.init).toBe(false);
    expect(args.port).toBeUndefined();
    expect(args.projectDir).toBeUndefined();
  });

  it('throws CliUsageError for `stop` with more than one extra argument', () => {
    expect(() => parseCliArgs(['stop', tmpDir, 'extra'])).toThrow(CliUsageError);
  });

  it('recognizes `init` as a subcommand with no project directory', () => {
    const args = parseCliArgs(['init']);
    expect(args.init).toBe(true);
    expect(args.projectDir).toBeUndefined();
  });

  it('recognizes `init <project-dir>` without raising the unexpected-argument error', () => {
    const args = parseCliArgs(['init', tmpDir]);
    expect(args.init).toBe(true);
    expect(args.projectDir).toBe(tmpDir);
  });

  it('leaves init false for a normal invocation', () => {
    expect(parseCliArgs([]).init).toBe(false);
    expect(parseCliArgs([tmpDir]).init).toBe(false);
  });

  it('throws CliUsageError for `init` with more than one extra argument', () => {
    expect(() => parseCliArgs(['init', tmpDir, 'extra'])).toThrow(CliUsageError);
  });

  it('throws CliUsageError for a nonexistent positional project directory', () => {
    expect(() => parseCliArgs([path.join(tmpDir, 'nope')])).toThrow(CliUsageError);
  });

  it('throws CliUsageError for a positional path that is a file, not a directory', () => {
    expect(() => parseCliArgs([tmpFile])).toThrow(CliUsageError);
  });
});

describe('usageText', () => {
  it('includes all documented flags', () => {
    const text = usageText();
    expect(text).toContain('--port=<n>');
    expect(text).toContain('<project-dir>');
    expect(text).toContain('--no-open');
    expect(text).toContain('--relaunch');
    expect(text).toContain('--help');
    expect(text).toContain('--version');
  });

  it('mentions the stop subcommand', () => {
    expect(usageText()).toContain('stop');
  });

  it('mentions the init subcommand', () => {
    expect(usageText()).toContain('init');
  });
});

describe('appVersion', () => {
  it('matches the version in package.json', () => {
    const packagePath = path.join(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name: string; version: string };
    expect(appVersion()).toBe(`${pkg.name} ${pkg.version}`);
  });
});

describe('appVersionNumber', () => {
  it('matches the bare version in package.json', () => {
    const packagePath = path.join(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name: string; version: string };
    expect(appVersionNumber()).toBe(pkg.version);
  });
});
