import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCliArgs, usageText, appVersion, CliUsageError } from './cli-args.js';

describe('parseCliArgs', () => {
  it('returns all defaults for an empty argv', () => {
    const args = parseCliArgs([]);
    expect(args.help).toBe(false);
    expect(args.version).toBe(false);
    expect(args.relaunch).toBe(false);
    expect(args.noOpen).toBe(false);
    expect(args.port).toBeUndefined();
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
});

describe('usageText', () => {
  it('includes all documented flags', () => {
    const text = usageText();
    expect(text).toContain('--port=<n>');
    expect(text).toContain('--no-open');
    expect(text).toContain('--relaunch');
    expect(text).toContain('--help');
    expect(text).toContain('--version');
  });
});

describe('appVersion', () => {
  it('matches the version in package.json', () => {
    const packagePath = path.join(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name: string; version: string };
    expect(appVersion()).toBe(`${pkg.name} ${pkg.version}`);
  });
});
